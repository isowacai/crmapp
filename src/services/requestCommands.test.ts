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
  teamId: 'data',
  ownerTeam: 'Data & Analytics',
  active: true
};

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
    expect(() => commands.createRequest(input, { ...service, active: false }, person(), 'n')).toThrow(commands.RequestRuleError);
    expect(() => commands.createRequest(input, { ...service, teamId: '' }, person(), 'n')).toThrow(/team/);
    expect(() => commands.createRequest({ ...input, title: '  ' }, service, person(), 'n')).toThrow(commands.RequestRuleError);
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
    expect(commands.plan(approved(), planInput({ commit: false }), manager, now).status).toBe('planned');
  });

  it('keeps work in progress as is when re-planned, and only records what changed', () => {
    const inProgress = apply(committed(), commands.start(committed(), worker, now));
    const patch = commands.plan(inProgress, planInput({ estimatedHours: 24 }), manager, now);
    expect(patch.status).toBe('in-progress');
    expect(patch.history!.at(-1)!.action).toMatch(/^Re-planned for Jo/);
    expect(patch.history!.at(-1)!.changes).toEqual([{ field: 'estimatedHours', from: 16, to: 24 }]);
    expect(() => commands.plan(inProgress, planInput({ commit: false }), manager)).toThrow(/stays committed/);
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

describe('delivery', () => {
  it('follows start → block → unblock → complete, logging hours', () => {
    let r = apply(committed(), commands.start(committed(), worker, now));
    expect(r.status).toBe('in-progress');
    r = apply(r, commands.logHours(r, 2, 'drafted query', worker, now));
    expect(r.history.at(-1)).toMatchObject({ action: 'Logged 2h', hours: 2, note: 'drafted query' });
    r = apply(r, commands.block(r, 'waiting for access', worker, now));
    expect(r.status).toBe('blocked');
    r = apply(r, commands.logHours(r, 1, '', worker, now));
    r = apply(r, commands.unblock(r, worker, now));
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
