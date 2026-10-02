import { describe, expect, it } from 'vitest';
import {
  buildForecast,
  buildPeriods,
  capacityBetween,
  checkCapacity,
  decisionWindow,
  periodKeyFor,
  workingDaysBetween
} from './forecast';
import { ServiceRequest, User } from '../types';

const user = (id: string, weekly = 40, overrides: Partial<User> = {}): User =>
  ({ id, displayName: id, email: null, role: 'staff', active: true, weeklyCapacityHours: weekly, teamId: 'ops', ...overrides }) as User;

const req = (id: string, overrides: Partial<ServiceRequest>): ServiceRequest =>
  ({
    id,
    teamId: 'ops',
    status: 'committed',
    assigneeId: 'u1',
    estimatedHours: 0,
    startDate: '',
    dueDate: '',
    neededBy: '',
    targetPeriod: '',
    ...overrides
  }) as ServiceRequest;

describe('periods and working days', () => {
  it('builds months and quarters', () => {
    const months = buildPeriods(new Date(2026, 9, 15), 'month', 3);
    expect(months.map(p => [p.key, p.start, p.end])).toEqual([
      ['2026-10', '2026-10-01', '2026-10-31'],
      ['2026-11', '2026-11-01', '2026-11-30'],
      ['2026-12', '2026-12-01', '2026-12-31']
    ]);
    const quarters = buildPeriods(new Date(2026, 10, 2), 'quarter', 2);
    expect(quarters.map(p => [p.key, p.start, p.end])).toEqual([
      ['2026-Q4', '2026-10-01', '2026-12-31'],
      ['2027-Q1', '2027-01-01', '2027-03-31']
    ]);
    expect(periodKeyFor('2026-02-10', 'quarter')).toBe('2026-Q1');
  });

  it('counts Mon–Fri working days', () => {
    expect(workingDaysBetween('2026-10-01', '2026-10-31')).toBe(22);
    expect(workingDaysBetween('2026-10-03', '2026-10-04')).toBe(0); // weekend
    expect(workingDaysBetween('2026-10-05', '2026-10-01')).toBe(0);
  });

  it('pro-rates weekly capacity and ignores inactive people', () => {
    // 22 working days × 8h/day + 22 × 4h/day (20h week)
    expect(capacityBetween([user('a'), user('b', 20), user('c', 40, { active: false })], '2026-10-01', '2026-10-31')).toBe(264);
  });
});

describe('checkCapacity', () => {
  const users = [user('u1', 10)]; // 2h per working day
  const window = { start: '2026-10-05', end: '2026-10-09' }; // one week → 10h

  it('compares effort with capacity left after committed work', () => {
    const requests = [req('c1', { estimatedHours: 6, startDate: '2026-10-05', dueDate: '2026-10-07' })];
    const check = checkCapacity({ users, requests, effort: 3, ...window });
    expect(check).toMatchObject({ available: 10, committed: 6, remaining: 4, effort: 3, status: 'tight' });
    expect(checkCapacity({ users, requests, effort: 5, ...window }).status).toBe('insufficient');
    expect(checkCapacity({ users, requests: [], effort: 3, ...window }).status).toBe('fits');
  });

  it('only counts committed work by these people, inside the window, excluding the request itself', () => {
    const requests = [
      req('self', { estimatedHours: 10, startDate: '2026-10-05', dueDate: '2026-10-09' }),
      req('approved', { status: 'approved', estimatedHours: 10, startDate: '2026-10-05', dueDate: '2026-10-09' }),
      req('other-person', { assigneeId: 'x', estimatedHours: 10, startDate: '2026-10-05', dueDate: '2026-10-09' }),
      req('next-week', { estimatedHours: 10, startDate: '2026-10-12', dueDate: '2026-10-16' })
    ];
    expect(checkCapacity({ users, requests, effort: 1, excludeId: 'self', ...window }).committed).toBe(0);
  });
});

describe('decisionWindow', () => {
  const today = new Date(2026, 9, 1);
  it('prefers planned dates, then requested completion, then target period, then four weeks', () => {
    expect(decisionWindow({ startDate: '2026-10-05', dueDate: '2026-10-20', neededBy: '', targetPeriod: '' }, today)).toMatchObject({ start: '2026-10-05', end: '2026-10-20', basis: 'planned dates' });
    expect(decisionWindow({ startDate: '', dueDate: '', neededBy: '2026-10-20', targetPeriod: '' }, today)).toMatchObject({ start: '2026-10-01', end: '2026-10-20' });
    expect(decisionWindow({ startDate: '', dueDate: '', neededBy: '', targetPeriod: '2026-11' }, today)).toMatchObject({ start: '2026-11-01', end: '2026-11-30' });
    expect(decisionWindow({ startDate: '', dueDate: '', neededBy: '2026-09-01', targetPeriod: '' }, today)).toMatchObject({ end: '2026-10-28', basis: 'next four weeks' });
  });
});

describe('buildForecast', () => {
  const periods = buildPeriods(new Date(2026, 9, 1), 'month', 3); // Oct–Dec 2026
  const users = [user('u1', 40)];

  it('shows capacity, committed work, approved demand, remaining capacity, and the gap', () => {
    const requests = [
      // committed across the Oct/Nov boundary: 10 working days → 5 in Oct, 5 in Nov
      req('c1', { estimatedHours: 100, startDate: '2026-10-26', dueDate: '2026-11-06' }),
      // approved for November by target period
      req('a1', { status: 'approved', estimatedHours: 200, targetPeriod: '2026-11' }),
      // approved, wanted in December
      req('a2', { status: 'approved', estimatedHours: 30, neededBy: '2026-12-15' }),
      // planned with dates: spread like committed work
      req('p1', { status: 'planned', estimatedHours: 16, startDate: '2026-10-01', dueDate: '2026-10-02' })
    ];
    const { periods: f, unscheduled } = buildForecast({ users, requests, periods, unit: 'month' });
    expect(f.map(p => [p.key, p.capacity, p.committed, p.demand])).toEqual([
      ['2026-10', 176, 50, 16],
      ['2026-11', 168, 50, 200],
      ['2026-12', 184, 0, 30]
    ]);
    expect(f[1]).toMatchObject({ remaining: 118, gap: -82 });
    expect(f[1].demandItems.map(i => i.request.id)).toEqual(['a1']);
    expect(f[0].committedItems).toEqual([{ request: requests[0], hours: 50 }]);
    expect(unscheduled).toEqual([]);
  });

  it('lists approved demand with no target as unscheduled, and counts overdue demand now', () => {
    const requests = [
      req('none', { status: 'approved', estimatedHours: 12 }),
      req('late', { status: 'approved', estimatedHours: 8, neededBy: '2026-08-10' }),
      req('far', { status: 'approved', estimatedHours: 8, targetPeriod: '2027-06' }),
      req('unestimated', { status: 'approved', estimatedHours: 0, targetPeriod: '2026-10' })
    ];
    const { periods: f, unscheduled } = buildForecast({ users, requests, periods, unit: 'month' });
    expect(unscheduled.map(i => i.request.id)).toEqual(['none']);
    expect(f[0].demand).toBe(8);
    expect(f.reduce((s, p) => s + p.demand, 0)).toBe(8); // "far" is beyond the horizon
  });

  it("filters demand by team and committed work by the team's people", () => {
    const requests = [
      req('c-other-person', { assigneeId: 'x', estimatedHours: 40, startDate: '2026-10-05', dueDate: '2026-10-09' }),
      req('a-other-team', { status: 'approved', teamId: 'data', estimatedHours: 40, targetPeriod: '2026-10' }),
      req('a-ops', { status: 'approved', estimatedHours: 10, targetPeriod: '2026-10' })
    ];
    const { periods: f } = buildForecast({ users, requests, teamIds: new Set(['ops']), periods, unit: 'month' });
    expect(f[0]).toMatchObject({ committed: 0, demand: 10 });
  });

  it('works by quarter', () => {
    const quarters = buildPeriods(new Date(2026, 9, 1), 'quarter', 2);
    const requests = [req('a1', { status: 'approved', estimatedHours: 50, targetPeriod: '2026-11' })];
    const { periods: f } = buildForecast({ users, requests, periods: quarters, unit: 'quarter' });
    expect(f.map(p => [p.key, p.demand])).toEqual([['2026-Q4', 50], ['2027-Q1', 0]]);
    expect(f[0].capacity).toBe(528); // 66 working days × 8h
  });
});

describe('capacity with a custom working week', () => {
  it('pro-rates weekly hours by the team’s working days', () => {
    const fourDays = { workingDays: [1, 2, 3, 4], hoursPerDay: 7 };
    // October 2026 has 17 Mondays–Thursdays; 28 h a week over 4 days = 7 h a day
    expect(workingDaysBetween('2026-10-01', '2026-10-31', fourDays)).toBe(17);
    expect(capacityBetween([{ id: 'a', active: true, weeklyCapacityHours: 28 } as never], '2026-10-01', '2026-10-31', fourDays)).toBe(119);
  });
});
