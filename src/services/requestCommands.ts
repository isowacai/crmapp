// Business rules for changing a demand item. Each command validates the change and returns the
// Firestore update (including an appended, structured history entry). Persistence stays in the caller.
import {
  Assessment,
  AssessmentCriterion,
  AssessmentDecision,
  Blocker,
  DependencyRef,
  ExpectedBenefit,
  FieldChange,
  Milestone,
  Outcome,
  OutcomeType,
  PriorityLevel,
  PriorityThresholds,
  RequestHistoryEntry,
  RequestStatus,
  Service,
  ServiceRequest,
  Team,
  TeamWorkflow,
  User
} from '../types';
import { buildAnswers } from '../lib/workspace';
import { deliveringTeamIds, deliversService } from '../lib/catalog';
import { formatHours, planWeeks } from '../lib/demand';
import { activeCriteria, calculateScore, levelForScore, PRIORITY_STYLES } from '../lib/priority';
import { outcomeLabel, validateOutcomeMetric } from '../lib/value';

export interface Actor {
  id: string;
  name: string;
}

export type RequestPatch = Partial<Omit<ServiceRequest, 'id' | 'createdAt'>>;

export class RequestRuleError extends Error {}

// Fields whose changes are recorded as previous → new values
const TRACKED_FIELDS = [
  'status',
  'priority',
  'priorityScore',
  'assigneeName',
  'estimatedHours',
  'startDate',
  'dueDate',
  'targetPeriod',
  'progress'
] as const satisfies readonly (keyof ServiceRequest)[];

// Which statuses a request may move to from each status
const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  new: ['assessing', 'approved', 'deferred', 'declined', 'cancelled'],
  assessing: ['assessing', 'approved', 'deferred', 'declined', 'cancelled'],
  approved: ['assessing', 'approved', 'planned', 'committed', 'deferred', 'declined', 'cancelled'],
  planned: ['assessing', 'planned', 'committed', 'deferred', 'declined', 'cancelled'],
  committed: ['planned', 'committed', 'in-progress', 'blocked', 'cancelled'],
  'in-progress': ['in-progress', 'blocked', 'completed'],
  blocked: ['blocked', 'in-progress', 'cancelled'],
  completed: ['in-progress'],
  deferred: ['new', 'assessing', 'approved', 'deferred', 'declined', 'cancelled'],
  declined: ['new'],
  cancelled: ['new']
};

export const canTransition = (from: RequestStatus, to: RequestStatus) => TRANSITIONS[from].includes(to);

// Statuses a request can be (re)assessed from
export const ASSESSABLE: RequestStatus[] = ['new', 'assessing', 'approved', 'planned', 'deferred'];

// Statuses a request can be planned or committed from (re-planning keeps in-progress/blocked work as is)
export const PLANNABLE: RequestStatus[] = ['approved', 'planned', 'committed', 'in-progress', 'blocked'];

// Statuses the requester or a manager can cancel from
export const CANCELLABLE: RequestStatus[] = ['new', 'assessing', 'approved', 'planned', 'committed', 'blocked', 'deferred'];

const diffTracked = (before: Partial<ServiceRequest>, after: Partial<ServiceRequest>): FieldChange[] =>
  TRACKED_FIELDS.filter(f => f in after && after[f] !== before[f]).map(f => ({
    field: f,
    from: (before[f] as string | number | null | undefined) ?? null,
    to: (after[f] as string | number | null | undefined) ?? null
  }));

// Applies `changes` to the request and appends a history entry describing them
const withEntry = (
  request: ServiceRequest,
  changes: RequestPatch,
  actor: Actor,
  entry: Omit<RequestHistoryEntry, 'at' | 'byId' | 'byName' | 'changes'>,
  now: Date
): RequestPatch => {
  const fieldChanges = diffTracked(request, changes);
  const historyEntry: RequestHistoryEntry = {
    ...entry,
    at: now.toISOString(),
    byId: actor.id,
    byName: actor.name,
    ...(fieldChanges.length ? { changes: fieldChanges } : {})
  };
  return { ...changes, history: [...(request.history || []), historyEntry] };
};

const requireNote = (note: string, what: string) => {
  if (!note.trim()) throw new RequestRuleError(`A reason is required to ${what}.`);
};

const transition = (
  request: ServiceRequest,
  to: RequestStatus,
  action: string,
  actor: Actor,
  now: Date,
  extra: { note?: string; hours?: number; changes?: RequestPatch } = {}
): RequestPatch => {
  if (!canTransition(request.status, to)) {
    throw new RequestRuleError(`Can't move a request from ${request.status} to ${to}.`);
  }
  return withEntry(
    request,
    { status: to, ...extra.changes },
    actor,
    {
      action,
      toStatus: to,
      ...(extra.note?.trim() ? { note: extra.note.trim() } : {}),
      ...(extra.hours ? { hours: extra.hours } : {})
    },
    now
  );
};

// ---------- Intake ----------

export interface NewRequestInput {
  title: string;
  description: string;
  businessJustification: string;
  neededBy: string;
  answers?: Record<string, string>; // replies to the service's request questions, by question ID
  lineOfBusiness?: string; // decides which delivering team gets it (see routeRequest)
}

// `team` is the delivering team the request was routed to by its line of business (routeRequest)
export const createRequest = (
  input: NewRequestInput,
  service: Service,
  team: Pick<Team, 'id' | 'name'> | undefined,
  requester: User,
  requestNumber: string,
  now = new Date()
): Omit<ServiceRequest, 'id' | 'createdAt'> => {
  if (!service.active) throw new RequestRuleError('This service is not accepting new requests.');
  if (deliveringTeamIds(service).length === 0) throw new RequestRuleError("This service isn't linked to a team yet. Ask an admin to set its team.");
  if (!team) {
    throw new RequestRuleError(
      input.lineOfBusiness
        ? `No team delivers ${service.name} for ${input.lineOfBusiness} yet. Ask the team's manager to add it on the Team page.`
        : 'Choose the line of business this request is for.'
    );
  }
  if (!deliversService(service, team.id)) throw new RequestRuleError(`${team.name} doesn't deliver ${service.name}.`);
  if (!input.title.trim() || !input.description.trim()) throw new RequestRuleError('A title and description are required.');
  const { answers, problems } = buildAnswers(service.requestFields ?? [], input.answers ?? {});
  if (problems.length) throw new RequestRuleError(problems.join(' '));

  return {
    requestNumber,
    teamId: team.id,
    teamName: team.name,
    serviceId: service.id,
    serviceName: service.name,
    category: service.category,
    title: input.title.trim(),
    description: input.description.trim(),
    businessJustification: input.businessJustification.trim(),
    answers,
    lineOfBusiness: input.lineOfBusiness?.trim() ?? '',
    requesterId: requester.id,
    requesterName: requester.displayName,
    requesterTeam: requester.team || '',
    status: 'new',
    neededBy: input.neededBy,
    // Assessed and prioritized by the team's lead or manager
    priority: '',
    priorityScore: null,
    calculatedPriority: '',
    priorityOverride: null,
    assessments: [],
    assigneeId: '',
    assigneeName: '',
    assigneeTeam: '',
    estimatedHours: 0,
    loggedHours: 0,
    startDate: '',
    dueDate: '',
    assignedAt: '',
    committedAt: '',
    targetPeriod: '',
    completedAt: '',
    actualStart: '',
    progress: 0,
    milestones: [],
    blockers: [],
    dependsOn: [],
    parentId: '',
    parentTeamId: '',
    parentNumber: '',
    parentTitle: '',
    parentTeamName: '',
    outcome: null,
    history: [{ at: now.toISOString(), byId: requester.id, byName: requester.displayName, action: 'Submitted', toStatus: 'new' }]
  };
};

// A request raised for another team as part of this one (cross-team demand). It belongs to the
// service's team and follows that team's pipeline; the parent keeps end-to-end visibility.
export const createSupportingRequest = (
  input: NewRequestInput,
  service: Service,
  team: Pick<Team, 'id' | 'name'> | undefined,
  parent: ServiceRequest,
  raisedBy: User,
  requestNumber: string,
  now = new Date()
): Omit<ServiceRequest, 'id' | 'createdAt'> => {
  if (parent.parentId) throw new RequestRuleError('A supporting request can’t have supporting requests of its own; raise it on the original.');
  if (['completed', 'declined', 'cancelled'].includes(parent.status)) {
    throw new RequestRuleError(`A ${parent.status} request can't take new supporting requests.`);
  }
  const base = createRequest(input, service, team, raisedBy, requestNumber, now);
  return {
    ...base,
    parentId: parent.id,
    parentTeamId: parent.teamId,
    parentNumber: parent.requestNumber,
    parentTitle: parent.title,
    parentTeamName: parent.teamName,
    history: [{ ...base.history[0], action: `Submitted as part of ${parent.requestNumber} (${parent.teamName})` }]
  };
};

// The parent's history note that a supporting request was raised
export const noteSupportingRequest = (parent: ServiceRequest, child: Pick<ServiceRequest, 'requestNumber' | 'teamName' | 'serviceName'>, actor: Actor, now = new Date()): RequestPatch =>
  withEntry(parent, {}, actor, { action: `Supporting request ${child.requestNumber} raised: ${child.serviceName} (${child.teamName})` }, now);

// ---------- Assessment & priority ----------

export interface AssessInput {
  expectedBenefit?: ExpectedBenefit | null; // undefined = leave as is; null or 0 hours = none expected
  scores: Record<string, number>;
  estimatedHours: number;
  dependencies: string;
  comments: string;
  decision: AssessmentDecision;
  revisitOn: string;
}

const DECISION_STATUS: Record<AssessmentDecision, RequestStatus> = {
  accept: 'approved',
  'more-info': 'assessing',
  defer: 'deferred',
  decline: 'declined'
};

const DECISION_LABEL: Record<AssessmentDecision, string> = {
  accept: 'accepted',
  'more-info': 'more information requested',
  defer: 'deferred',
  decline: 'declined'
};

export const assess = (
  request: ServiceRequest,
  input: AssessInput,
  model: { criteria: AssessmentCriterion[]; thresholds: PriorityThresholds; workflow?: TeamWorkflow },
  actor: Actor,
  now = new Date()
): RequestPatch => {
  if (input.decision === 'more-info' && model.workflow && !model.workflow.useAssessing) {
    throw new RequestRuleError("This team doesn't use the Assessing stage. Comment on the request to ask a question instead.");
  }
  if (!ASSESSABLE.includes(request.status)) {
    throw new RequestRuleError(`A ${request.status} request can't be reassessed. Override its priority instead.`);
  }

  const criteria = activeCriteria(model.criteria);
  const missing = criteria.filter(c => input.scores[c.key] === undefined);
  // Requesting more information doesn't need a full assessment yet
  if (input.decision !== 'more-info' && missing.length) {
    throw new RequestRuleError(`Score every criterion before deciding: ${missing.map(c => c.label).join(', ')}.`);
  }
  for (const c of criteria) {
    const v = input.scores[c.key];
    if (v !== undefined && (v < c.min || v > c.max)) throw new RequestRuleError(`${c.label} must be between ${c.min} and ${c.max}.`);
  }
  if (input.decision === 'accept' && !(input.estimatedHours > 0)) {
    throw new RequestRuleError('Estimate the effort before accepting.');
  }
  if (input.estimatedHours < 0) throw new RequestRuleError('Estimated effort cannot be negative.');
  const benefit = input.expectedBenefit;
  if (benefit && (!Number.isFinite(benefit.hoursSavedPerMonth) || benefit.hoursSavedPerMonth < 0)) {
    throw new RequestRuleError('Hours saved per month must be zero or more.');
  }
  const expectedBenefit =
    benefit === undefined
      ? undefined
      : benefit && (benefit.hoursSavedPerMonth > 0 || benefit.description.trim())
      ? { hoursSavedPerMonth: benefit.hoursSavedPerMonth, description: benefit.description.trim() }
      : null;
  if (input.decision !== 'accept') requireNote(input.comments, `mark a request as ${DECISION_LABEL[input.decision]}`);

  const score = missing.length ? null : calculateScore(input.scores, criteria);
  const calculatedPriority: PriorityLevel | '' = score === null ? '' : levelForScore(score, model.thresholds);

  // Accepting a request that's already planned keeps it planned
  const status: RequestStatus = input.decision === 'accept' && request.status === 'planned' ? 'planned' : DECISION_STATUS[input.decision];
  if (!canTransition(request.status, status)) {
    throw new RequestRuleError(`Can't move a request from ${request.status} to ${status}.`);
  }

  const assessment: Assessment = {
    at: now.toISOString(),
    byId: actor.id,
    byName: actor.name,
    criteria: criteria.map(({ key, label, weight, min, max, direction }) => ({ key, label, weight, min, max, direction })),
    scores: Object.fromEntries(criteria.filter(c => input.scores[c.key] !== undefined).map(c => [c.key, input.scores[c.key]])),
    score,
    calculatedPriority,
    estimatedHours: input.estimatedHours,
    dependencies: input.dependencies.trim(),
    comments: input.comments.trim(),
    decision: input.decision,
    revisitOn: input.decision === 'defer' ? input.revisitOn : ''
  };

  const changes: RequestPatch = {
    status,
    assessments: [...(request.assessments || []), assessment],
    ...(score !== null
      ? {
          priorityScore: score,
          calculatedPriority,
          // A manager override stays in force until it's cleared
          priority: request.priorityOverride?.level ?? calculatedPriority
        }
      : {}),
    ...(input.estimatedHours > 0 ? { estimatedHours: input.estimatedHours } : {}),
    ...(expectedBenefit !== undefined ? { expectedBenefit } : {}),
    // A weekly split by hand no longer adds up once the estimate changes; go back to an even spread
    ...(request.weeklyPlan && input.estimatedHours > 0 && input.estimatedHours !== request.estimatedHours ? { weeklyPlan: null } : {})
  };

  const scoreText = score !== null ? ` · score ${score}/100 (${PRIORITY_STYLES[calculatedPriority as PriorityLevel].label})` : '';
  return withEntry(
    request,
    changes,
    actor,
    {
      action: `Assessed: ${DECISION_LABEL[input.decision]}${scoreText}${
        expectedBenefit?.hoursSavedPerMonth ? ` · expected to save ${formatHours(expectedBenefit.hoursSavedPerMonth)} a month` : ''
      }`,
      toStatus: status,
      ...(input.comments.trim() ? { note: input.comments.trim() } : {})
    },
    now
  );
};

// Sets a manager-assigned priority (or clears it with level = null to return to the calculated one)
export const overridePriority = (
  request: ServiceRequest,
  level: PriorityLevel | null,
  reason: string,
  actor: Actor,
  now = new Date()
): RequestPatch => {
  if (level) {
    requireNote(reason, 'override the calculated priority');
    return withEntry(
      request,
      {
        priority: level,
        priorityOverride: { level, reason: reason.trim(), byId: actor.id, byName: actor.name, at: now.toISOString() }
      },
      actor,
      { action: `Priority set to ${PRIORITY_STYLES[level].label} by manager`, note: reason.trim() },
      now
    );
  }
  if (!request.priorityOverride) throw new RequestRuleError('There is no manager priority to clear.');
  return withEntry(
    request,
    { priority: request.calculatedPriority, priorityOverride: null },
    actor,
    { action: 'Manager priority cleared; using the calculated priority', ...(reason.trim() ? { note: reason.trim() } : {}) },
    now
  );
};

// ---------- Planning & commitment ----------

// Statuses that must be assessed/approved (or reopened) before planning
const INTAKE_OR_CLOSED: RequestStatus[] = ['new', 'assessing', 'deferred', 'declined', 'cancelled', 'completed'];

export interface PlanInput {
  assignee: User;
  estimatedHours: number;
  startDate: string;
  dueDate: string;
  note: string;
  commit: boolean; // true = allocate capacity (committed); false = tentative plan
  workflow?: TeamWorkflow;
  weeklyPlan?: Record<string, number> | null; // hours per week set by hand; null = spread evenly
}

export const plan = (request: ServiceRequest, input: PlanInput, actor: Actor, now = new Date()): RequestPatch => {
  if (!PLANNABLE.includes(request.status)) {
    throw new RequestRuleError(
      INTAKE_OR_CLOSED.includes(request.status)
        ? 'Assess and approve this request before planning it.'
        : `A ${request.status} request can't be planned. Reopen it first.`
    );
  }
  if (!input.commit && input.workflow && !input.workflow.usePlanned) {
    throw new RequestRuleError("This team doesn't use the Planned stage; commit the work instead.");
  }
  if (!(input.estimatedHours > 0)) throw new RequestRuleError('Estimated effort must be more than 0 hours.');
  if (!input.startDate || !input.dueDate) throw new RequestRuleError('Planned start and due dates are required.');
  if (input.dueDate < input.startDate) throw new RequestRuleError('The due date cannot be before the start date.');
  // A split by hand must stay inside the planned weeks and add up to the estimate
  let weeklyPlan: Record<string, number> | null = null;
  if (input.weeklyPlan) {
    const weeks = new Set(planWeeks(input.startDate, input.dueDate));
    const entries = Object.entries(input.weeklyPlan).filter(([, h]) => h !== 0);
    if (entries.some(([w]) => !weeks.has(w))) throw new RequestRuleError('The weekly split includes weeks outside the planned dates.');
    if (entries.some(([, h]) => !Number.isFinite(h) || h < 0)) throw new RequestRuleError('Weekly hours must be zero or more.');
    const total = entries.reduce((sum, [, h]) => sum + h, 0);
    if (Math.abs(total - input.estimatedHours) > 0.01) {
      throw new RequestRuleError(`The weekly hours add up to ${formatHours(total)}, but the estimate is ${formatHours(input.estimatedHours)}.`);
    }
    weeklyPlan = Object.fromEntries(entries);
  }

  // Work already underway keeps its state when re-planned
  const underway = request.status === 'in-progress' || request.status === 'blocked';
  if (underway && !input.commit) throw new RequestRuleError('Work in progress stays committed; it can only be re-planned.');
  const status: RequestStatus = underway ? request.status : input.commit ? 'committed' : 'planned';

  const assigneeName = input.assignee.displayName || input.assignee.email || 'Unknown';
  const ownerText =
    !request.assigneeId ? `for ${assigneeName}` : request.assigneeId !== input.assignee.id ? `and reassigned to ${assigneeName}` : `for ${assigneeName}`;
  const verb = underway || (request.status === 'committed' && input.commit) ? 'Re-planned' : input.commit ? 'Committed' : 'Planned';

  return withEntry(
    request,
    {
      status,
      assigneeId: input.assignee.id,
      assigneeName,
      assigneeTeam: input.assignee.team || '',
      estimatedHours: input.estimatedHours,
      startDate: input.startDate,
      dueDate: input.dueDate,
      weeklyPlan,
      // The target period follows the planned completion
      targetPeriod: input.dueDate.slice(0, 7),
      assignedAt: request.assignedAt || now.toISOString(),
      // Committed date: when capacity was first committed; cleared if the commitment is withdrawn
      committedAt: status === 'planned' ? '' : request.committedAt || now.toISOString()
    },
    actor,
    {
      action: `${verb} ${ownerText} · ${formatHours(input.estimatedHours)} · ${input.startDate} → ${input.dueDate}${
        weeklyPlan ? ` · split by week: ${Object.entries(weeklyPlan).sort().map(([w, h]) => `${w} ${formatHours(h)}`).join(', ')}` : ''
      }`,
      toStatus: status,
      ...(input.note.trim() ? { note: input.note.trim() } : {})
    },
    now
  );
};

// Moves approved or planned demand to another month without planning it in detail
export const setTargetPeriod = (request: ServiceRequest, period: string, reason: string, actor: Actor, now = new Date()): RequestPatch => {
  if (!['approved', 'planned', 'deferred'].includes(request.status)) {
    throw new RequestRuleError('Only approved, planned, or deferred demand has a target period to change. Re-plan committed work instead.');
  }
  if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new RequestRuleError('Choose a month for the target period.');
  if (period === request.targetPeriod) throw new RequestRuleError('That is already the target period.');
  return withEntry(
    request,
    { targetPeriod: period },
    actor,
    { action: period ? `Target period set to ${period}` : 'Target period cleared', ...(reason.trim() ? { note: reason.trim() } : {}) },
    now
  );
};

// ---------- Delivery ----------

const newId = (now: Date) => `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const start = (request: ServiceRequest, actor: Actor, now = new Date()) =>
  transition(request, 'in-progress', 'Work started', actor, now, {
    changes: request.actualStart ? {} : { actualStart: now.toISOString() }
  });

export const block = (request: ServiceRequest, reason: string, actor: Actor, now = new Date()) => {
  requireNote(reason, 'mark work as blocked');
  const blocker: Blocker = {
    id: newId(now),
    description: reason.trim(),
    raisedAt: now.toISOString(),
    raisedById: actor.id,
    raisedByName: actor.name,
    resolvedAt: '',
    resolution: ''
  };
  return transition(request, 'blocked', 'Blocked', actor, now, { note: reason, changes: { blockers: [...(request.blockers || []), blocker] } });
};

export const unblock = (request: ServiceRequest, resolution: string, actor: Actor, now = new Date()) =>
  transition(request, 'in-progress', 'Unblocked', actor, now, {
    note: resolution,
    changes: {
      blockers: (request.blockers || []).map(b =>
        b.resolvedAt ? b : { ...b, resolvedAt: now.toISOString(), resolution: resolution.trim() }
      )
    }
  });

export const complete = (request: ServiceRequest, hours: number, note: string, actor: Actor, now = new Date()) => {
  if (hours < 0) throw new RequestRuleError('Hours cannot be negative.');
  return transition(request, 'completed', hours ? `Completed · logged ${formatHours(hours)}` : 'Completed', actor, now, {
    note,
    hours,
    changes: { completedAt: now.toISOString(), loggedHours: request.loggedHours + hours, progress: 100 }
  });
};

// ---------- Progress, milestones, dependencies ----------

const DELIVERING: RequestStatus[] = ['committed', 'in-progress', 'blocked'];

export const setProgress = (request: ServiceRequest, progress: number, note: string, actor: Actor, now = new Date()): RequestPatch => {
  if (!DELIVERING.includes(request.status)) throw new RequestRuleError('Progress is tracked once work is committed.');
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) throw new RequestRuleError('Progress must be a whole number from 0 to 100.');
  if (progress === (request.progress || 0)) throw new RequestRuleError('Progress is already at that value.');
  return withEntry(request, { progress }, actor, { action: `Progress updated to ${progress}%`, ...(note.trim() ? { note: note.trim() } : {}) }, now);
};

export const addMilestone = (request: ServiceRequest, title: string, dueDate: string, actor: Actor, now = new Date()): RequestPatch => {
  if (['completed', 'declined', 'cancelled'].includes(request.status)) throw new RequestRuleError(`A ${request.status} request can't take new milestones.`);
  if (!title.trim()) throw new RequestRuleError('A milestone needs a title.');
  if (dueDate && request.dueDate && dueDate > request.dueDate) {
    throw new RequestRuleError(`The milestone is due after the planned completion (${request.dueDate}).`);
  }
  const milestone: Milestone = { id: newId(now), title: title.trim(), dueDate, done: false, doneAt: '' };
  return withEntry(request, { milestones: [...(request.milestones || []), milestone] }, actor, {
    action: `Milestone added: ${milestone.title}${dueDate ? ` (due ${dueDate})` : ''}`
  }, now);
};

export const setMilestoneDone = (request: ServiceRequest, milestoneId: string, done: boolean, actor: Actor, now = new Date()): RequestPatch => {
  const milestone = (request.milestones || []).find(m => m.id === milestoneId);
  if (!milestone) throw new RequestRuleError('That milestone no longer exists.');
  if (milestone.done === done) throw new RequestRuleError(done ? 'That milestone is already done.' : 'That milestone is already open.');
  return withEntry(
    request,
    { milestones: request.milestones.map(m => (m.id === milestoneId ? { ...m, done, doneAt: done ? now.toISOString() : '' } : m)) },
    actor,
    { action: done ? `Milestone reached: ${milestone.title}` : `Milestone reopened: ${milestone.title}` },
    now
  );
};

export const removeMilestone = (request: ServiceRequest, milestoneId: string, actor: Actor, now = new Date()): RequestPatch => {
  const milestone = (request.milestones || []).find(m => m.id === milestoneId);
  if (!milestone) throw new RequestRuleError('That milestone no longer exists.');
  return withEntry(request, { milestones: request.milestones.filter(m => m.id !== milestoneId) }, actor, {
    action: `Milestone removed: ${milestone.title}`
  }, now);
};

// Replaces the list of requests this one depends on. `known` is every request the caller can see,
// used to refuse links that would make two requests wait on each other.
export const setDependencies = (
  request: ServiceRequest,
  dependsOn: DependencyRef[],
  known: ServiceRequest[],
  actor: Actor,
  now = new Date()
): RequestPatch => {
  const ids = dependsOn.map(d => d.id);
  if (ids.includes(request.id)) throw new RequestRuleError("A request can't depend on itself.");
  if (new Set(ids).size !== ids.length) throw new RequestRuleError('Each dependency can only be added once.');

  // Refuse cycles: does anything we'd depend on (directly or indirectly) already depend on us?
  const byId = new Map(known.map(r => [r.id, r]));
  const seen = new Set<string>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === request.id) throw new RequestRuleError('That would make these requests wait on each other.');
    if (seen.has(id)) continue;
    seen.add(id);
    for (const d of byId.get(id)?.dependsOn || []) stack.push(d.id);
  }

  const before = new Set((request.dependsOn || []).map(d => d.id));
  const added = dependsOn.filter(d => !before.has(d.id)).map(d => d.requestNumber);
  const removed = (request.dependsOn || []).filter(d => !ids.includes(d.id)).map(d => d.requestNumber);
  if (!added.length && !removed.length) throw new RequestRuleError('No changes to the dependencies.');

  const parts = [added.length ? `added ${added.join(', ')}` : '', removed.length ? `removed ${removed.join(', ')}` : ''].filter(Boolean);
  return withEntry(request, { dependsOn }, actor, { action: `Dependencies ${parts.join('; ')}` }, now);
};

export const logHours = (request: ServiceRequest, hours: number, note: string, actor: Actor, now = new Date()) => {
  if (!(hours > 0)) throw new RequestRuleError('Logged hours must be more than 0.');
  if (request.status !== 'in-progress' && request.status !== 'blocked') {
    throw new RequestRuleError('Hours can only be logged on work in progress.');
  }
  return withEntry(
    request,
    { loggedHours: request.loggedHours + hours },
    actor,
    { action: `Logged ${formatHours(hours)}`, hours, ...(note.trim() ? { note: note.trim() } : {}) },
    now
  );
};

// ---------- Outcomes ----------

export type OutcomeInput = Pick<Outcome, 'types' | 'metrics' | 'summary'> & { hoursSavedPerMonth?: number | null };

// Records (or updates) the value delivered by completed work. Financial value is optional.
export const recordOutcome = (request: ServiceRequest, input: OutcomeInput, actor: Actor, now = new Date()): RequestPatch => {
  if (request.status !== 'completed') throw new RequestRuleError('Outcomes are recorded once the work is completed.');
  const hoursSaved = input.hoursSavedPerMonth ?? null;
  if (hoursSaved !== null && (!Number.isFinite(hoursSaved) || hoursSaved < 0)) throw new RequestRuleError('Hours saved per month must be zero or more.');
  // Hours saved is a time-saved outcome, whether or not it was ticked
  const types: OutcomeType[] = hoursSaved ? [...new Set<OutcomeType>([...input.types, 'time-saved'])] : input.types;
  if (types.length === 0) throw new RequestRuleError('Choose at least one kind of outcome.');
  if (!input.summary.trim()) throw new RequestRuleError('Describe the outcome in a sentence or two.');
  for (const m of input.metrics) {
    const problem = validateOutcomeMetric(m);
    if (problem) throw new RequestRuleError(problem);
  }
  const outcome: Outcome = {
    types: [...new Set(types)],
    metrics: input.metrics.map(m => ({ ...m, description: m.description.trim() })),
    hoursSavedPerMonth: hoursSaved,
    summary: input.summary.trim(),
    recordedAt: now.toISOString(),
    recordedById: actor.id,
    recordedByName: actor.name
  };
  return withEntry(request, { outcome }, actor, {
    action: `${request.outcome ? 'Outcome updated' : 'Outcome recorded'}: ${outcome.types.map(outcomeLabel).join(', ')}`,
    note: outcome.summary
  }, now);
};

// ---------- Closing & reopening ----------

export const cancel = (request: ServiceRequest, reason: string, actor: Actor, now = new Date()) => {
  requireNote(reason, 'cancel a request');
  if (!CANCELLABLE.includes(request.status)) throw new RequestRuleError(`A ${request.status} request can't be cancelled.`);
  return transition(request, 'cancelled', 'Cancelled', actor, now, { note: reason });
};

// Completed work goes back into progress; declined, cancelled, or deferred demand goes back to New
export const reopen = (request: ServiceRequest, reason: string, actor: Actor, now = new Date()) => {
  const to: RequestStatus = request.status === 'completed' ? 'in-progress' : 'new';
  return transition(request, to, 'Reopened', actor, now, {
    note: reason,
    changes: request.status === 'completed' ? { completedAt: '' } : {}
  });
};

export const comment = (request: ServiceRequest, text: string, actor: Actor, now = new Date()) => {
  if (!text.trim()) throw new RequestRuleError('A comment cannot be empty.');
  return withEntry(request, {}, actor, { action: 'Comment', note: text.trim() }, now);
};
