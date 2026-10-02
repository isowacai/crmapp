import { describe, expect, it } from 'vitest';
import * as commands from './requestCommands';
import { DEFAULT_CRITERIA, DEFAULT_THRESHOLDS } from '../lib/priority';
import { Service, ServiceRequest, User } from '../types';

const now = new Date('2026-09-30T12:00:00Z');
const manager: commands.Actor = { id: 'm1', name: 'Morgan' };
const worker: commands.Actor = { id: 'u1', name: 'Jo' };
const model = { criteria: DEFAULT_CRITERIA, thresholds: DEFAULT_THRESHOLDS };

const service: Service = {
  id: 's1',
  name: 'Data extract',
  category: 'Data',
  description: '',
  teamIds: ['data'],
  active: true
};
const dataTeam = { id: 'data', name: 'Data & Analytics' };

const person = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  email: 'jo@example.com',
  displayName: 'Jo',
  role: 'staff',
  lastLogin: now,
  createdAt: now,
  active: true,
  teamId: 'data',
  team: 'Data & Analytics',
  weeklyCapacityHours: 40,
  ...overrides
});

const newRequest = (): ServiceRequest => ({
  ...commands.createRequest(
    { title: ' Export sales ', description: 'Q3 sales by region', businessJustification: 'Board pack', neededBy: '2026-10-10' },
    service,
    dataTeam,
    person({ id: 'r1', displayName: 'Rae', team: 'Sales' }),
    'REQ-20260930-0001',
    now
  ),
  id: 'REQ-20260930-0001',
  createdAt: { seconds: 0, nanoseconds: 0 }
});

// Applies a patch the way Firestore would
const apply = (r: ServiceRequest, patch: commands.RequestPatch): ServiceRequest => ({ ...r, ...patch });

const scores = (value: number) => Object.fromEntries(DEFAULT_CRITERIA.map(c => [c.key, value]));

const assessInput = (overrides: Partial<commands.AssessInput> = {}): commands.AssessInput => ({
  scores: { ...scores(5), complexity: 1 },
  estimatedHours: 16,
  dependencies: '',
  comments: '',
  decision: 'accept',
  revisitOn: '',
  ...overrides
});

const planInput = (overrides: Partial<commands.PlanInput> = {}): commands.PlanInput => ({
  assignee: person(),
  estimatedHours: 16,
  startDate: '2026-10-01',
  dueDate: '2026-10-07',
  note: '',
  commit: true,
  ...overrides
});

const approved = () => apply(newRequest(), commands.assess(newRequest(), assessInput(), model, manager, now));
const committed = () => apply(approved(), commands.plan(approved(), planInput(), manager, now));

describe('createRequest', () => {
  it("creates new, unprioritized demand owned by the service's team", () => {
    const r = newRequest();
    expect(r).toMatchObject({
      status: 'new',
      teamId: 'data',
      teamName: 'Data & Analytics',
      priority: '',
      priorityScore: null,
      priorityOverride: null,
      assessments: [],
      title: 'Export sales'
    });
    expect(r.history).toEqual([{ at: now.toISOString(), byId: 'r1', byName: 'Rae', action: 'Submitted', toStatus: 'new' }]);
  });

  it('refuses inactive or team-less services and blank titles', () => {
    const input = { title: 'x', description: 'y', businessJustification: '', neededBy: '' };
    expect(() => commands.createRequest(input, { ...service, active: false }, dataTeam, person(), 'n')).toThrow(commands.RequestRuleError);
    expect(() => commands.createRequest(input, { ...service, teamIds: [] }, dataTeam, person(), 'n')).toThrow(/team/);
    expect(() => commands.createRequest(input, service, undefined, person(), 'n')).toThrow(/line of business/);
    expect(() => commands.createRequest(input, service, { id: 'ops', name: 'Ops' }, person(), 'n')).toThrow("Ops doesn't deliver Data extract.");
    expect(() => commands.createRequest({ ...input, title: '  ' }, service, dataTeam, person(), 'n')).toThrow(commands.RequestRuleError);
  });
});

describe('request questions and team workflow', () => {
  const withQuestions: Service = {
    ...service,
    requestFields: [
      { id: 'region', label: 'Region', type: 'select', required: true, options: ['EMEA', 'APAC'], help: '' },
      { id: 'rows', label: 'Approx. rows', type: 'number', required: false, options: [], help: '' }
    ]
  };
  const base = { title: 'Export', description: 'Sales', businessJustification: '', neededBy: '' };

  it("stores answers to the service's questions and requires the required ones", () => {
    const r = commands.createRequest({ ...base, answers: { region: 'EMEA', rows: '' } }, withQuestions, dataTeam, person(), 'n', now);
    expect(r.answers).toEqual([{ fieldId: 'region', label: 'Region', value: 'EMEA' }]);
    expect(() => commands.createRequest(base, withQuestions, dataTeam, person(), 'n')).toThrow('Please answer "Region".');
  });

  it("respects a team that doesn't use Assessing or Planned", () => {
    const lean = { useAssessing: false, usePlanned: false };
    expect(() => commands.assess(newRequest(), assessInput({ decision: 'more-info', comments: 'Which?' }), { ...model, workflow: lean }, manager)).toThrow(/Assessing/);
    expect(() => commands.plan(approved(), planInput({ commit: false, workflow: lean }), manager)).toThrow(/Planned/);
    expect(commands.plan(approved(), planInput({ workflow: lean }), manager, now).status).toBe('committed');
  });
});

describe('assess', () => {
  it('approves, scores, and prioritizes accepted demand, keeping the assessment', () => {
    const patch = commands.assess(newRequest(), assessInput(), model, manager, now);
    expect(patch).toMatchObject({ status: 'approved', priorityScore: 100, calculatedPriority: 'critical', priority: 'critical', estimatedHours: 16 });
    expect(patch.assessments).toHaveLength(1);
    expect(patch.assessments![0]).toMatchObject({ byName: 'Morgan', decision: 'accept', score: 100, estimatedHours: 16 });
    expect(patch.assessments![0].criteria.map(c => c.key)).toEqual(DEFAULT_CRITERIA.map(c => c.key));
    const entry = patch.history!.at(-1)!;
    expect(entry.action).toBe('Assessed: accepted · score 100/100 (Critical)');
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: 'status', from: 'new', to: 'approved' },
        { field: 'priority', from: '', to: 'critical' },
        { field: 'priorityScore', from: null, to: 100 },
        { field: 'estimatedHours', from: 0, to: 16 }
      ])
    );
  });

  it('maps each decision to a pipeline status', () => {
    const r = newRequest();
    expect(commands.assess(r, assessInput({ decision: 'defer', comments: 'Next quarter', revisitOn: '2027-01-05' }), model, manager).status).toBe('deferred');
    expect(commands.assess(r, assessInput({ decision: 'decline', comments: 'Out of scope' }), model, manager).status).toBe('declined');
    expect(commands.assess(r, assessInput({ decision: 'more-info', comments: 'Which regions?' }), model, manager).status).toBe('assessing');
  });

  it('lets a manager ask for more information before scoring', () => {
    const patch = commands.assess(newRequest(), assessInput({ scores: {}, estimatedHours: 0, decision: 'more-info', comments: 'Which regions?' }), model, manager);
    expect(patch.status).toBe('assessing');
    expect(patch.priorityScore).toBeUndefined();
    expect(patch.assessments![0].score).toBeNull();
  });

  it('requires complete scores, an estimate to accept, and a reason otherwise', () => {
    const r = newRequest();
    expect(() => commands.assess(r, assessInput({ scores: { businessValue: 5 } }), model, manager)).toThrow(/Score every criterion/);
    expect(() => commands.assess(r, assessInput({ estimatedHours: 0 }), model, manager)).toThrow(/Estimate/);
    expect(() => commands.assess(r, assessInput({ decision: 'decline' }), model, manager)).toThrow(/reason/);
    expect(() => commands.assess(r, assessInput({ scores: { ...scores(9) } }), model, manager)).toThrow(/between 1 and 5/);
  });

  it('keeps a manager override in force on reassessment', () => {
    const overridden = apply(approved(), commands.overridePriority(approved(), 'low', 'Parked by director', manager, now));
    const patch = commands.assess(overridden, assessInput(), model, manager, now);
    expect(patch).toMatchObject({ calculatedPriority: 'critical', priority: 'low' });
  });

  it("doesn't reassess committed work", () => {
    expect(() => commands.assess(committed(), assessInput(), model, manager)).toThrow(/Override its priority/);
  });
});

describe('overridePriority', () => {
  it('separates the manager-assigned priority from the calculated one', () => {
    const patch = commands.overridePriority(approved(), 'medium', 'Waiting on vendor', manager, now);
    expect(patch).toMatchObject({
      priority: 'medium',
      priorityOverride: { level: 'medium', reason: 'Waiting on vendor', byName: 'Morgan' }
    });
    expect(patch.calculatedPriority).toBeUndefined();
    expect(patch.history!.at(-1)!.changes).toEqual([{ field: 'priority', from: 'critical', to: 'medium' }]);
  });

  it('requires a reason, and clearing returns to the calculated priority', () => {
    expect(() => commands.overridePriority(approved(), 'low', ' ', manager)).toThrow(/reason/);
    const overridden = apply(approved(), commands.overridePriority(approved(), 'low', 'x', manager, now));
    expect(commands.overridePriority(overridden, null, '', manager, now)).toMatchObject({ priority: 'critical', priorityOverride: null });
    expect(() => commands.overridePriority(approved(), null, '', manager)).toThrow(/no manager priority/);
  });
});

describe('plan and commit', () => {
  it('commits approved demand to an owner and dates', () => {
    const patch = commands.plan(approved(), planInput(), manager, now);
    expect(patch).toMatchObject({ status: 'committed', assigneeId: 'u1', assigneeName: 'Jo', assignedAt: now.toISOString() });
    expect(patch.history!.at(-1)!.action).toBe('Committed for Jo · 16h · 2026-10-01 → 2026-10-07');
  });

  it('can plan tentatively without committing capacity', () => {
    expect(commands.plan(approved(), planInput({ commit: false }), manager, now)).toMatchObject({ status: 'planned', committedAt: '' });
  });

  it('records the committed date and target period, and keeps the original commitment date on re-plans', () => {
    const patch = commands.plan(approved(), planInput(), manager, now);
    expect(patch).toMatchObject({ committedAt: now.toISOString(), targetPeriod: '2026-10' });
    const later = new Date('2026-10-05T09:00:00Z');
    const replanned = commands.plan(committed(), planInput({ dueDate: '2026-11-03' }), manager, later);
    expect(replanned).toMatchObject({ committedAt: now.toISOString(), targetPeriod: '2026-11' });
    expect(replanned.history!.at(-1)!.changes).toEqual(
      expect.arrayContaining([
        { field: 'dueDate', from: '2026-10-07', to: '2026-11-03' },
        { field: 'targetPeriod', from: '2026-10', to: '2026-11' }
      ])
    );
  });

  it('withdraws a commitment back to planned', () => {
    expect(commands.plan(committed(), planInput({ commit: false }), manager, now)).toMatchObject({ status: 'planned', committedAt: '' });
  });

  it('keeps work in progress as is when re-planned, and only records what changed', () => {
    const inProgress = apply(committed(), commands.start(committed(), worker, now));
    const patch = commands.plan(inProgress, planInput({ estimatedHours: 24 }), manager, now);
    expect(patch.status).toBe('in-progress');
    expect(patch.history!.at(-1)!.action).toMatch(/^Re-planned for Jo/);
    expect(patch.history!.at(-1)!.changes).toEqual([{ field: 'estimatedHours', from: 16, to: 24 }]);
    expect(() => commands.plan(inProgress, planInput({ commit: false }), manager)).toThrow(/stays committed/);
  });

  it('saves hours split by week by hand, which must add up to the estimate and stay in the plan', () => {
    const weeklyPlan = { '2026-09-28': 4, '2026-10-05': 12 };
    const patch = commands.plan(approved(), planInput({ weeklyPlan }), manager, now);
    expect(patch.weeklyPlan).toEqual(weeklyPlan);
    expect(patch.history!.at(-1)!.action).toMatch(/split by week: 2026-09-28 4h, 2026-10-05 12h$/);
    expect(commands.plan(approved(), planInput(), manager, now).weeklyPlan).toBeNull();
    expect(() => commands.plan(approved(), planInput({ weeklyPlan: { '2026-09-28': 4, '2026-10-05': 10 } }), manager)).toThrow(/add up to 14h/);
    expect(() => commands.plan(approved(), planInput({ weeklyPlan: { '2026-09-28': 4, '2026-10-12': 12 } }), manager)).toThrow(/outside the planned dates/);
  });

  it('goes back to an even spread when a reassessment changes the estimate', () => {
    const split = apply(approved(), commands.plan(approved(), planInput({ weeklyPlan: { '2026-09-28': 4, '2026-10-05': 12 }, commit: false }), manager, now));
    const reassessed = commands.assess(split, { scores: { businessValue: 3, urgency: 3, strategicAlignment: 3, riskReduction: 3, complexity: 3 }, estimatedHours: 20, dependencies: '', comments: '', decision: 'accept', revisitOn: '' }, model, manager, now);
    expect(reassessed.weeklyPlan).toBeNull();
  });

  it('records the expected benefit at assessment, and leaves it alone when not given', () => {
    const scores = { businessValue: 3, urgency: 3, strategicAlignment: 3, riskReduction: 3, complexity: 3 };
    const base = { scores, estimatedHours: 16, dependencies: '', comments: '', decision: 'accept' as const, revisitOn: '' };
    const patch = commands.assess(newRequest(), { ...base, expectedBenefit: { hoursSavedPerMonth: 6, description: ' Manual exports ' } }, model, manager, now);
    expect(patch.expectedBenefit).toEqual({ hoursSavedPerMonth: 6, description: 'Manual exports' });
    expect(patch.history!.at(-1)!.action).toMatch(/expected to save 6h a month$/);
    expect(commands.assess(newRequest(), { ...base, expectedBenefit: { hoursSavedPerMonth: 0, description: '' } }, model, manager, now).expectedBenefit).toBeNull();
    expect('expectedBenefit' in commands.assess(newRequest(), base, model, manager, now)).toBe(false);
    expect(() => commands.assess(newRequest(), { ...base, expectedBenefit: { hoursSavedPerMonth: -2, description: '' } }, model, manager)).toThrow(/zero or more/);
  });

  it('describes a change of owner as a reassignment', () => {
    const patch = commands.plan(committed(), planInput({ assignee: person({ id: 'u2', displayName: 'Sam' }) }), manager, now);
    expect(patch.history!.at(-1)!.action).toMatch(/and reassigned to Sam/);
  });

  it('requires assessment first and a valid plan', () => {
    expect(() => commands.plan(newRequest(), planInput(), manager)).toThrow(/Assess and approve/);
    expect(() => commands.plan(approved(), planInput({ estimatedHours: 0 }), manager)).toThrow(/more than 0/);
    expect(() => commands.plan(approved(), planInput({ dueDate: '2026-09-01' }), manager)).toThrow(/before the start/);
  });
});

describe('setTargetPeriod', () => {
  it('moves approved demand to another month and records why', () => {
    const patch = commands.setTargetPeriod(approved(), '2026-12', 'Not enough capacity in November', manager, now);
    expect(patch.targetPeriod).toBe('2026-12');
    expect(patch.history!.at(-1)).toMatchObject({
      action: 'Target period set to 2026-12',
      note: 'Not enough capacity in November',
      changes: [{ field: 'targetPeriod', from: '', to: '2026-12' }]
    });
  });

  it('validates the month and refuses committed work', () => {
    expect(() => commands.setTargetPeriod(approved(), '2026-13', '', manager)).toThrow(/month/);
    expect(() => commands.setTargetPeriod(committed(), '2026-12', '', manager)).toThrow(/Re-plan/);
  });
});

describe('delivery', () => {
  it('follows start → block → unblock → complete, logging hours', () => {
    let r = apply(committed(), commands.start(committed(), worker, now));
    expect(r.status).toBe('in-progress');
    r = apply(r, commands.logHours(r, 2, 'drafted query', worker, now));
    expect(r.history.at(-1)).toMatchObject({ action: 'Logged 2h', hours: 2, note: 'drafted query' });
    r = apply(r, commands.block(r, 'waiting for access', worker, now));
    expect(r.status).toBe('blocked');
    r = apply(r, commands.logHours(r, 1, '', worker, now));
    r = apply(r, commands.unblock(r, 'access granted', worker, now));
    r = apply(r, commands.complete(r, 3, '', worker, now));
    expect(r).toMatchObject({ status: 'completed', loggedHours: 6, completedAt: now.toISOString() });
    r = apply(r, commands.reopen(r, 'Missed a region', manager, now));
    expect(r).toMatchObject({ status: 'in-progress', completedAt: '' });
  });

  it('refuses steps out of order', () => {
    expect(() => commands.start(approved(), manager)).toThrow("Can't move a request from approved to in-progress");
    expect(() => commands.complete(committed(), 0, '', manager)).toThrow(commands.RequestRuleError);
    expect(() => commands.logHours(committed(), 1, '', manager)).toThrow('work in progress');
    expect(() => commands.block(committed(), '', manager)).toThrow(/reason/);
  });
});

describe('delivery tracking', () => {
  const inProgress = () => apply(committed(), commands.start(committed(), worker, now));

  it('records the actual start only the first time work starts', () => {
    const r = inProgress();
    expect(r.actualStart).toBe(now.toISOString());
    const blocked = apply(r, commands.block(r, 'waiting', worker, now));
    const later = new Date('2026-10-03T09:00:00Z');
    expect(commands.unblock(blocked, '', worker, later).actualStart).toBeUndefined();
  });

  it('keeps a record of each blocker and how it was resolved', () => {
    const blocked = apply(inProgress(), commands.block(inProgress(), 'Waiting for firewall change', worker, now));
    expect(blocked.blockers).toEqual([
      expect.objectContaining({ description: 'Waiting for firewall change', raisedByName: 'Jo', resolvedAt: '' })
    ]);
    const later = new Date('2026-10-02T12:00:00Z');
    const unblocked = apply(blocked, commands.unblock(blocked, 'Change applied', worker, later));
    expect(unblocked.blockers[0]).toMatchObject({ resolvedAt: later.toISOString(), resolution: 'Change applied' });
    expect(unblocked.status).toBe('in-progress');
  });

  it('tracks progress, and completing sets it to 100%', () => {
    const r = apply(inProgress(), commands.setProgress(inProgress(), 40, 'Draft done', worker, now));
    expect(r.progress).toBe(40);
    expect(r.history.at(-1)!.changes).toEqual([{ field: 'progress', from: 0, to: 40 }]);
    expect(() => commands.setProgress(r, 140, '', worker)).toThrow(/0 to 100/);
    expect(() => commands.setProgress(approved(), 10, '', worker)).toThrow(/committed/);
    expect(apply(r, commands.complete(r, 0, '', worker, now)).progress).toBe(100);
  });

  it('adds, ticks off, and removes milestones', () => {
    let r = apply(committed(), commands.addMilestone(committed(), 'Design agreed', '2026-10-03', manager, now));
    const id = r.milestones[0].id;
    expect(r.milestones[0]).toMatchObject({ title: 'Design agreed', dueDate: '2026-10-03', done: false });
    expect(() => commands.addMilestone(r, 'Too late', '2026-12-01', manager)).toThrow(/after the planned completion/);
    r = apply(r, commands.setMilestoneDone(r, id, true, worker, now));
    expect(r.milestones[0]).toMatchObject({ done: true, doneAt: now.toISOString() });
    expect(r.history.at(-1)!.action).toBe('Milestone reached: Design agreed');
    expect(() => commands.setMilestoneDone(r, id, true, worker)).toThrow(/already done/);
    r = apply(r, commands.removeMilestone(r, id, manager, now));
    expect(r.milestones).toEqual([]);
  });

  it('sets dependencies and refuses self, duplicate, and circular links', () => {
    const a = { ...committed(), id: 'A', requestNumber: 'REQ-A' };
    const b = { ...committed(), id: 'B', requestNumber: 'REQ-B', dependsOn: [{ id: 'A', requestNumber: 'REQ-A', title: '' }] };
    const c = { ...committed(), id: 'C', requestNumber: 'REQ-C', dependsOn: [{ id: 'B', requestNumber: 'REQ-B', title: '' }] };
    const ref = (r: ServiceRequest) => ({ id: r.id, requestNumber: r.requestNumber, title: r.title });
    const known = [a, b, c];

    const patch = commands.setDependencies(b, [ref(a), ref({ ...c, id: 'D', requestNumber: 'REQ-D' })], known, manager, now);
    expect(patch.history!.at(-1)!.action).toBe('Dependencies added REQ-D');
    expect(() => commands.setDependencies(a, [ref(a)], known, manager)).toThrow(/itself/);
    expect(() => commands.setDependencies(a, [ref(b), ref(b)], known, manager)).toThrow(/once/);
    // A → C would close the loop C → B → A
    expect(() => commands.setDependencies(a, [ref(c)], known, manager)).toThrow(/wait on each other/);
  });
});

describe('cross-team supporting requests', () => {
  const securityService: Service = { ...service, id: 'sec', name: 'Security assessment', teamIds: ['security', 'grc'] };
  const security = { id: 'security', name: 'Security' };
  const input = { title: 'Review the new export', description: 'Pen test the endpoint', businessJustification: '', neededBy: '' };

  it("belongs to the service's team and links back to the original", () => {
    const child = commands.createSupportingRequest(input, securityService, security, approved(), person({ id: 'm1', displayName: 'Morgan' }), 'REQ-20260930-0002', now);
    expect(child).toMatchObject({
      teamId: 'security',
      status: 'new',
      requesterId: 'm1',
      parentId: 'REQ-20260930-0001',
      parentTeamId: 'data',
      parentNumber: 'REQ-20260930-0001',
      parentTitle: 'Export sales',
      parentTeamName: 'Data & Analytics'
    });
    expect(child.history[0].action).toBe('Submitted as part of REQ-20260930-0001 (Data & Analytics)');
  });

  it('notes the supporting request on the original', () => {
    const patch = commands.noteSupportingRequest(approved(), { requestNumber: 'REQ-2', teamName: 'Security', serviceName: 'Security assessment' }, manager, now);
    expect(Object.keys(patch)).toEqual(['history']);
    expect(patch.history!.at(-1)!.action).toBe('Supporting request REQ-2 raised: Security assessment (Security)');
  });

  it('stays one level deep and only on open demand', () => {
    const child = { ...approved(), parentId: 'P' };
    expect(() => commands.createSupportingRequest(input, securityService, security, child, person(), 'n')).toThrow(/original/);
    const declined = { ...newRequest(), status: 'declined' as const };
    expect(() => commands.createSupportingRequest(input, securityService, security, declined, person(), 'n')).toThrow(/declined/);
  });
});

describe('recordOutcome', () => {
  const done = () => {
    const c = committed();
    const started = apply(c, commands.start(c, worker, now));
    return apply(started, commands.complete(started, 4, '', worker, now));
  };
  const input: commands.OutcomeInput = {
    types: ['cost-avoidance', 'time-saved'],
    metrics: [
      { type: 'cost-avoidance', value: 12000, unit: 'USD', description: ' Avoided a vendor report ' },
      { type: 'time-saved', value: 40, unit: 'hours', description: '' }
    ],
    summary: ' The board pack is now automated. '
  };

  it('records quantitative and qualitative value on completed work', () => {
    const patch = commands.recordOutcome(done(), input, manager, now);
    expect(patch.outcome).toMatchObject({
      types: ['cost-avoidance', 'time-saved'],
      summary: 'The board pack is now automated.',
      recordedByName: 'Morgan'
    });
    expect(patch.outcome!.metrics[0].description).toBe('Avoided a vendor report');
    expect(patch.history!.at(-1)!.action).toBe('Outcome recorded: Cost avoidance, Time saved');
  });

  it('records the confirmed hours saved a month, which counts as time saved', () => {
    const patch = commands.recordOutcome(done(), { types: ['compliance'], metrics: [], summary: 'Automated', hoursSavedPerMonth: 6 }, manager, now);
    expect(patch.outcome).toMatchObject({ hoursSavedPerMonth: 6, types: ['compliance', 'time-saved'] });
    // Hours saved alone is enough of an outcome
    expect(commands.recordOutcome(done(), { types: [], metrics: [], summary: 'Automated', hoursSavedPerMonth: 2 }, manager, now).outcome!.types).toEqual(['time-saved']);
    expect(() => commands.recordOutcome(done(), { ...input, hoursSavedPerMonth: -1 }, manager)).toThrow(/zero or more/);
  });

  it("doesn't require financial value", () => {
    const qualitative = commands.recordOutcome(done(), { types: ['compliance'], metrics: [], summary: 'Audit finding closed' }, manager, now);
    expect(qualitative.outcome!.metrics).toEqual([]);
  });

  it('requires completed work, a type, a summary, and valid numbers', () => {
    expect(() => commands.recordOutcome(committed(), input, manager)).toThrow(/completed/);
    expect(() => commands.recordOutcome(done(), { ...input, types: [] }, manager)).toThrow(/kind of outcome/);
    expect(() => commands.recordOutcome(done(), { ...input, summary: ' ' }, manager)).toThrow(/Describe/);
    expect(() => commands.recordOutcome(done(), { ...input, metrics: [{ type: 'revenue', value: -5, unit: 'USD', description: '' }] }, manager)).toThrow(/negative/);
  });

  it('says when an outcome is updated', () => {
    const recorded = apply(done(), commands.recordOutcome(done(), input, manager, now));
    expect(commands.recordOutcome(recorded, input, manager, now).history!.at(-1)!.action).toMatch(/^Outcome updated/);
  });
});

describe('closing and reopening', () => {
  it('cancels open demand with a reason and reopens it as new', () => {
    expect(() => commands.cancel(newRequest(), '', manager)).toThrow(/reason/);
    const cancelled = apply(newRequest(), commands.cancel(newRequest(), 'Duplicate', manager, now));
    expect(cancelled.status).toBe('cancelled');
    expect(commands.reopen(cancelled, '', manager, now).status).toBe('new');
    const inProgress = apply(committed(), commands.start(committed(), worker, now));
    expect(() => commands.cancel(inProgress, 'x', manager)).toThrow(/can't be cancelled/);
  });

  it('adds comments without changing fields', () => {
    const patch = commands.comment(newRequest(), 'Any update?', manager, now);
    expect(Object.keys(patch)).toEqual(['history']);
    expect(() => commands.comment(newRequest(), '', manager)).toThrow();
  });
});
