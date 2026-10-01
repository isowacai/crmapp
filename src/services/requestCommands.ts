// Business rules for changing a demand item. Each command validates the change and returns the
// Firestore update (including an appended, structured history entry). Persistence stays in the caller.
import {
  Assessment,
  AssessmentCriterion,
  AssessmentDecision,
  FieldChange,
  PriorityLevel,
  PriorityThresholds,
  RequestHistoryEntry,
  RequestStatus,
  Service,
  ServiceRequest,
  User
} from '../types';
import { formatHours } from '../lib/demand';
import { activeCriteria, calculateScore, levelForScore, PRIORITY_STYLES } from '../lib/priority';

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
  'dueDate'
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
}

export const createRequest = (
  input: NewRequestInput,
  service: Service,
  requester: User,
  requestNumber: string,
  now = new Date()
): Omit<ServiceRequest, 'id' | 'createdAt'> => {
  if (!service.active) throw new RequestRuleError('This service is not accepting new requests.');
  if (!service.teamId) throw new RequestRuleError("This service isn't linked to a team yet. Ask an admin to set its team.");
  if (!input.title.trim() || !input.description.trim()) throw new RequestRuleError('A title and description are required.');

  return {
    requestNumber,
    teamId: service.teamId,
    teamName: service.ownerTeam,
    serviceId: service.id,
    serviceName: service.name,
    category: service.category,
    title: input.title.trim(),
    description: input.description.trim(),
    businessJustification: input.businessJustification.trim(),
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
    completedAt: '',
    history: [{ at: now.toISOString(), byId: requester.id, byName: requester.displayName, action: 'Submitted', toStatus: 'new' }]
  };
};

// ---------- Assessment & priority ----------

export interface AssessInput {
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
  model: { criteria: AssessmentCriterion[]; thresholds: PriorityThresholds },
  actor: Actor,
  now = new Date()
): RequestPatch => {
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
    ...(input.estimatedHours > 0 ? { estimatedHours: input.estimatedHours } : {})
  };

  const scoreText = score !== null ? ` · score ${score}/100 (${PRIORITY_STYLES[calculatedPriority as PriorityLevel].label})` : '';
  return withEntry(
    request,
    changes,
    actor,
    {
      action: `Assessed: ${DECISION_LABEL[input.decision]}${scoreText}`,
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
}

export const plan = (request: ServiceRequest, input: PlanInput, actor: Actor, now = new Date()): RequestPatch => {
  if (!PLANNABLE.includes(request.status)) {
    throw new RequestRuleError(
      INTAKE_OR_CLOSED.includes(request.status)
        ? 'Assess and approve this request before planning it.'
        : `A ${request.status} request can't be planned. Reopen it first.`
    );
  }
  if (!(input.estimatedHours > 0)) throw new RequestRuleError('Estimated effort must be more than 0 hours.');
  if (!input.startDate || !input.dueDate) throw new RequestRuleError('Planned start and due dates are required.');
  if (input.dueDate < input.startDate) throw new RequestRuleError('The due date cannot be before the start date.');

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
      assignedAt: request.assignedAt || now.toISOString()
    },
    actor,
    {
      action: `${verb} ${ownerText} · ${formatHours(input.estimatedHours)} · ${input.startDate} → ${input.dueDate}`,
      toStatus: status,
      ...(input.note.trim() ? { note: input.note.trim() } : {})
    },
    now
  );
};

// ---------- Delivery ----------

export const start = (request: ServiceRequest, actor: Actor, now = new Date()) =>
  transition(request, 'in-progress', 'Work started', actor, now);

export const block = (request: ServiceRequest, reason: string, actor: Actor, now = new Date()) => {
  requireNote(reason, 'mark work as blocked');
  return transition(request, 'blocked', 'Blocked', actor, now, { note: reason });
};

export const unblock = (request: ServiceRequest, actor: Actor, now = new Date()) =>
  transition(request, 'in-progress', 'Unblocked', actor, now);

export const complete = (request: ServiceRequest, hours: number, note: string, actor: Actor, now = new Date()) => {
  if (hours < 0) throw new RequestRuleError('Hours cannot be negative.');
  return transition(request, 'completed', hours ? `Completed · logged ${formatHours(hours)}` : 'Completed', actor, now, {
    note,
    hours,
    changes: { completedAt: now.toISOString(), loggedHours: request.loggedHours + hours }
  });
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
