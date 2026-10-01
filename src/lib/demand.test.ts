import { describe, expect, it } from 'vitest';
import {
  addWorkingDays,
  allocateByWeek,
  buildCapacity,
  compareByUrgency,
  generateDailyNumber,
  loggedByUserWeek,
  loggedOn,
  plannedInWeeks,
  startOfWeek,
  summarizeTeams,
  toDateKey,
  utilization
} from './demand';
import { ServiceRequest, User } from '../types';

// Minimal request fixture; tests override only what they care about
const req = (overrides: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: 'r1',
  requestNumber: 'REQ-20260930-0001',
  teamId: 'ops',
  teamName: 'Ops',
  serviceId: 's1',
  serviceName: 'Service',
  category: 'Cat',
  title: 'T',
  description: '',
  businessJustification: '',
  requesterId: 'req',
  requesterName: 'Req',
  requesterTeam: '',
  priority: '',
  priorityScore: null,
  calculatedPriority: '',
  priorityOverride: null,
  assessments: [],
  status: 'committed',
  neededBy: '',
  assigneeId: 'u1',
  assigneeName: 'A',
  assigneeTeam: 'Ops',
  estimatedHours: 0,
  loggedHours: 0,
  startDate: '',
  dueDate: '',
  assignedAt: '',
  completedAt: '',
  history: [],
  createdAt: { seconds: 0, nanoseconds: 0 },
  ...overrides
});

const user = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  email: 'a@example.com',
  displayName: 'A',
  role: 'staff',
  lastLogin: new Date(),
  createdAt: new Date(),
  active: true,
  team: 'Ops',
  weeklyCapacityHours: 10,
  ...overrides
});

describe('ordering', () => {
  it('sorts open before closed, unset priority first, then earliest due', () => {
    const open = req({ id: 'open', status: 'committed', priority: 'high', dueDate: '2026-10-01' });
    const openLater = req({ id: 'later', status: 'committed', priority: 'high', dueDate: '2026-10-09' });
    const done = req({ id: 'done', status: 'completed', priority: 'critical' });
    const unset = req({ id: 'unset', status: 'new', priority: '' });
    expect([done, openLater, open, unset].sort(compareByUrgency).map(r => r.id)).toEqual(['unset', 'open', 'later', 'done']);
  });
});

describe('dates', () => {
  it('starts weeks on Monday', () => {
    expect(toDateKey(startOfWeek(new Date(2026, 8, 30)))).toBe('2026-09-28'); // Wednesday
    expect(toDateKey(startOfWeek(new Date(2026, 9, 4)))).toBe('2026-09-28'); // Sunday
  });

  it('skips weekends when adding working days', () => {
    expect(toDateKey(addWorkingDays(new Date(2026, 9, 2), 1))).toBe('2026-10-05'); // Fri → Mon
  });
});

describe('numbering', () => {
  it("continues today's sequence and ignores other days", () => {
    const today = toDateKey(new Date()).replace(/-/g, '');
    expect(generateDailyNumber('REQ', [`REQ-${today}-0007`, 'REQ-20200101-0099'])).toBe(`REQ-${today}-0008`);
    expect(generateDailyNumber('REQ', [])).toBe(`REQ-${today}-0001`);
  });
});

describe('capacity', () => {
  it('spreads effort evenly over working days, by week', () => {
    // Wed 30 Sep → Tue 6 Oct = 5 working days → 4h/day
    const byWeek = allocateByWeek({ estimatedHours: 20, startDate: '2026-09-30', dueDate: '2026-10-06' });
    expect(Object.fromEntries(byWeek)).toEqual({ '2026-09-28': 12, '2026-10-05': 8 });
  });

  it('puts a weekend-only plan on the start week', () => {
    const byWeek = allocateByWeek({ estimatedHours: 5, startDate: '2026-10-03', dueDate: '2026-10-04' });
    expect(Object.fromEntries(byWeek)).toEqual({ '2026-09-28': 5 });
  });

  it('counts only committed/in-progress work for active users', () => {
    const users = [user(), user({ id: 'u2', active: false })];
    const requests = [
      req({ estimatedHours: 20, startDate: '2026-09-30', dueDate: '2026-10-06' }),
      req({ status: 'blocked', estimatedHours: 99, startDate: '2026-09-30', dueDate: '2026-09-30' }),
      req({ status: 'planned', estimatedHours: 99, startDate: '2026-09-30', dueDate: '2026-09-30' }),
      req({ status: 'completed', estimatedHours: 99, startDate: '2026-09-30', dueDate: '2026-09-30' })
    ];
    const rows = buildCapacity(users, requests, ['2026-09-28', '2026-10-05']);
    expect(rows).toHaveLength(1);
    expect(rows[0].allocated).toEqual({ '2026-09-28': 12, '2026-10-05': 8 });
    expect(utilization(12, 10)).toBe(120);
  });

  it('puts people without a team in "Unassigned"', () => {
    const rows = buildCapacity([user({ team: '' })], [], ['2026-09-28']);
    expect(rows[0].team).toBe('Unassigned');
  });

  it('sums team capacity, planned and logged hours per week', () => {
    const weeks = ['2026-09-28'];
    const rows = buildCapacity(
      [user(), user({ id: 'u2', weeklyCapacityHours: 30 })],
      [req({ estimatedHours: 12, startDate: '2026-09-28', dueDate: '2026-10-02' })],
      weeks
    );
    const logged = new Map([['u2', new Map([['2026-09-28', 5]])]]);
    const [ops] = summarizeTeams(rows, weeks, logged);
    expect(ops).toMatchObject({ team: 'Ops', members: 2 });
    expect(ops.capacity['2026-09-28']).toBe(40);
    expect(ops.planned['2026-09-28']).toBe(12);
    expect(ops.logged['2026-09-28']).toBe(5);
  });
});

describe('logged hours', () => {
  const r = req({
    status: 'in-progress',
    estimatedHours: 20,
    startDate: '2026-09-30',
    dueDate: '2026-10-06',
    history: [
      { at: '2026-09-30T10:00:00', byId: 'u1', byName: 'A', action: 'Logged 3h', hours: 3 },
      { at: '2026-10-06T10:00:00', byId: 'u2', byName: 'B', action: 'Logged 2h', hours: 2 },
      { at: '2026-10-01T10:00:00', byId: 'u1', byName: 'A', action: 'Comment' }
    ]
  });
  const week = new Set(['2026-09-28']);

  it('groups logged hours by person and week', () => {
    expect(loggedByUserWeek([r]).get('u1')?.get('2026-09-28')).toBe(3);
    expect(loggedByUserWeek([r]).get('u2')?.get('2026-10-05')).toBe(2);
  });

  it('filters logged hours by person and week', () => {
    expect(loggedOn(r)).toBe(5);
    expect(loggedOn(r, { byIds: new Set(['u1']) })).toBe(3);
    expect(loggedOn(r, { weeks: week })).toBe(3);
  });

  it('counts planned hours in a period only while work is active', () => {
    expect(plannedInWeeks(r, week)).toBe(12);
    expect(plannedInWeeks({ ...r, status: 'blocked' }, week)).toBe(0);
    expect(plannedInWeeks({ ...r, status: 'planned' }, week)).toBe(0);
  });
});
