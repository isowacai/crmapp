import { PriorityLevel, RequestStatus, ServiceRequest, Team, User } from '../types';
import { PRIORITY_LEVELS } from './priority';
import { DEFAULT_WEEKLY_CAPACITY } from './roles';

// ---------- Priority ordering ----------

export const PRIORITIES = PRIORITY_LEVELS;

// Sort order: not yet prioritized first (it needs assessing), then Critical → Low
export const priorityRank = (p: PriorityLevel | '') => (p ? PRIORITY_LEVELS.indexOf(p) + 1 : 0);

// ---------- Pipeline ----------

export const STATUS_STYLES: Record<RequestStatus, { label: string; badge: string }> = {
  new: { label: 'New', badge: 'bg-purple-100 text-purple-800' },
  assessing: { label: 'Assessing', badge: 'bg-violet-100 text-violet-800' },
  approved: { label: 'Approved', badge: 'bg-indigo-100 text-indigo-800' },
  planned: { label: 'Planned', badge: 'bg-sky-100 text-sky-800' },
  committed: { label: 'Committed', badge: 'bg-blue-100 text-blue-800' },
  'in-progress': { label: 'In progress', badge: 'bg-cyan-100 text-cyan-800' },
  blocked: { label: 'Blocked', badge: 'bg-red-100 text-red-800' },
  completed: { label: 'Completed', badge: 'bg-emerald-100 text-emerald-800' },
  deferred: { label: 'Deferred', badge: 'bg-amber-100 text-amber-800' },
  declined: { label: 'Declined', badge: 'bg-gray-200 text-gray-700' },
  cancelled: { label: 'Cancelled', badge: 'bg-gray-100 text-gray-600' }
};

// Demand still being worked on or waiting for a decision
export const OPEN_STATUSES: RequestStatus[] = ['new', 'assessing', 'approved', 'planned', 'committed', 'in-progress', 'blocked'];

// Waiting for assessment / prioritization
export const INTAKE_STATUSES: RequestStatus[] = ['new', 'assessing'];

// Statuses whose planned effort counts against the owner's capacity (committed work)
export const LOAD_STATUSES: RequestStatus[] = ['committed', 'in-progress'];

// Statuses with a planned delivery date that can be missed
export const SCHEDULED_STATUSES: RequestStatus[] = ['planned', 'committed', 'in-progress', 'blocked'];

export const isOpen = (r: ServiceRequest) => OPEN_STATUSES.includes(r.status);

// ---------- Numbering ----------

// Next number for today: PREFIX-YYYYMMDD-NNNN
export const generateDailyNumber = (prefix: string, existing: string[]): string => {
  const datePart = toDateKey(new Date()).replace(/-/g, '');
  const sameDay = new RegExp(`^${prefix}-${datePart}-(\\d+)$`);
  const last = existing.reduce((max, n) => {
    const match = n.match(sameDay);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `${prefix}-${datePart}-${String(last + 1).padStart(4, '0')}`;
};

// ---------- Dates ----------

// Local-time YYYY-MM-DD
export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const parseDateKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// ---------- Working time ----------

// The team's working week. Estimates are spread over working days, and weekly capacity is pro-rated by them.
export interface WorkCalendar {
  workingDays: number[]; // 0 = Sunday … 6 = Saturday
  hoursPerDay: number;
}

export const DEFAULT_CALENDAR: WorkCalendar = { workingDays: [1, 2, 3, 4, 5], hoursPerDay: 8 };

export const calendarOf = (team?: Pick<Team, 'workingDays' | 'hoursPerDay'> | null): WorkCalendar => ({
  workingDays: team?.workingDays?.length ? [...team.workingDays].sort((a, b) => a - b) : DEFAULT_CALENDAR.workingDays,
  hoursPerDay: team?.hoursPerDay && team.hoursPerDay > 0 ? team.hoursPerDay : DEFAULT_CALENDAR.hoursPerDay
});

// Hours in a full working week, e.g. 5 days × 7 hours = 35
export const standardWeek = (calendar: WorkCalendar) => calendar.workingDays.length * calendar.hoursPerDay;

export const isWorkingDay = (date: Date, calendar: WorkCalendar = DEFAULT_CALENDAR) => calendar.workingDays.includes(date.getDay());

// Adds working days to a date
export const addWorkingDays = (date: Date, days: number, calendar: WorkCalendar = DEFAULT_CALENDAR): Date => {
  let result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result = addDays(result, 1);
    if (isWorkingDay(result, calendar)) remaining--;
  }
  return result;
};

// Monday of the week containing `date`
export const startOfWeek = (date: Date): Date => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (result.getDay() + 6) % 7; // Monday = 0
  return addDays(result, -offset);
};

// Monday dates (as YYYY-MM-DD) for `count` weeks starting at the week containing `from`
export const weekKeys = (from: Date, count: number): string[] =>
  Array.from({ length: count }, (_, i) => toDateKey(addDays(startOfWeek(from), i * 7)));

export const formatWeek = (weekKey: string): string =>
  parseDateKey(weekKey).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export const firestoreDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (typeof value === 'string') return new Date(value);
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  return null;
};

export const isOverdue = (r: ServiceRequest, today = new Date()) =>
  SCHEDULED_STATUSES.includes(r.status) && !!r.dueDate && r.dueDate < toDateKey(today);

// ---------- Capacity ----------

type Plannable = Pick<ServiceRequest, 'estimatedHours' | 'startDate' | 'dueDate'> & { weeklyPlan?: Record<string, number> | null };

// Spreads a request's estimated hours over the team's working days between its start and due dates,
// returning hours per day (YYYY-MM-DD): evenly, or week by week when the planner split it by hand
// (each week's hours spread evenly over that week's working days). A plan with no working days puts
// everything on its start date (or, for a week, its first day in the plan).
export const allocateByDay = (r: Plannable, calendar: WorkCalendar = DEFAULT_CALENDAR): Map<string, number> => {
  const byDay = new Map<string, number>();
  if (!r.estimatedHours || !r.startDate) return byDay;

  const start = parseDateKey(r.startDate);
  const end = r.dueDate && r.dueDate >= r.startDate ? parseDateKey(r.dueDate) : start;

  if (r.weeklyPlan) {
    for (const [week, hours] of Object.entries(r.weeklyPlan)) {
      if (!(hours > 0)) continue;
      const weekStart = parseDateKey(week);
      const inPlan: Date[] = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(weekStart, i);
        if (d >= start && d <= end) inPlan.push(d);
      }
      const working = inPlan.filter(d => isWorkingDay(d, calendar));
      const days = working.length ? working : inPlan.length ? [inPlan[0]] : [weekStart];
      for (const d of days) byDay.set(toDateKey(d), (byDay.get(toDateKey(d)) || 0) + hours / days.length);
    }
    return byDay;
  }

  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isWorkingDay(d, calendar)) days.push(d);
  }
  if (days.length === 0) days.push(start);

  const perDay = r.estimatedHours / days.length;
  for (const day of days) byDay.set(toDateKey(day), perDay);
  return byDay;
};

// The same spread, totalled per week (keyed by the week's Monday)
export const allocateByWeek = (r: Plannable, calendar: WorkCalendar = DEFAULT_CALENDAR): Map<string, number> => {
  const byWeek = new Map<string, number>();
  for (const [day, hours] of allocateByDay(r, calendar)) {
    const key = toDateKey(startOfWeek(parseDateKey(day)));
    byWeek.set(key, (byWeek.get(key) || 0) + hours);
  }
  return byWeek;
};

// The weeks (Mondays) a plan from `startDate` to `dueDate` touches, at most 26
export const planWeeks = (startDate: string, dueDate: string): string[] => {
  if (!startDate) return [];
  const start = parseDateKey(startDate);
  const end = dueDate && dueDate >= startDate ? parseDateKey(dueDate) : start;
  const count = Math.round((startOfWeek(end).getTime() - startOfWeek(start).getTime()) / (7 * 86400000)) + 1;
  return weekKeys(start, Math.min(Math.max(count, 1), 26));
};

// Team shown for people who have no team set
export const UNASSIGNED_TEAM = 'Unassigned';

export interface CapacityRow {
  userId: string;
  name: string;
  team: string;
  weeklyCapacity: number;
  allocated: Record<string, number>; // week → planned hours
}

// Planned load per person per week from requests that are assigned or in progress
export const buildCapacity = (users: User[], requests: ServiceRequest[], weeks: string[], calendar: WorkCalendar = DEFAULT_CALENDAR): CapacityRow[] => {
  const rows = new Map<string, CapacityRow>();
  for (const u of users) {
    if (u.active === false) continue;
    rows.set(u.id, {
      userId: u.id,
      name: u.displayName || u.email || 'Unknown',
      team: u.team || UNASSIGNED_TEAM,
      weeklyCapacity: u.weeklyCapacityHours ?? DEFAULT_WEEKLY_CAPACITY,
      allocated: Object.fromEntries(weeks.map(w => [w, 0]))
    });
  }

  for (const r of requests) {
    if (!LOAD_STATUSES.includes(r.status) || !r.assigneeId) continue;
    const row = rows.get(r.assigneeId);
    if (!row) continue;
    for (const [week, hours] of allocateByWeek(r, calendar)) {
      if (week in row.allocated) row.allocated[week] += hours;
    }
  }

  return [...rows.values()].sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));
};

// Actual hours logged per person per week, from request history entries that carry `hours`
export const loggedByUserWeek = (requests: ServiceRequest[]): Map<string, Map<string, number>> => {
  const result = new Map<string, Map<string, number>>();
  for (const r of requests) {
    for (const h of r.history || []) {
      if (!h.hours) continue;
      const week = toDateKey(startOfWeek(new Date(h.at)));
      const byWeek = result.get(h.byId) || new Map<string, number>();
      byWeek.set(week, (byWeek.get(week) || 0) + h.hours);
      result.set(h.byId, byWeek);
    }
  }
  return result;
};

export interface TeamSummary {
  team: string;
  members: number;
  capacity: Record<string, number>; // week → combined capacity hours
  planned: Record<string, number>; // week → combined planned hours
  logged: Record<string, number>; // week → combined logged hours
}

// Per-team weekly totals from per-person capacity rows and logged hours
export const summarizeTeams = (
  rows: CapacityRow[],
  weeks: string[],
  logged: Map<string, Map<string, number>>
): TeamSummary[] =>
  [...new Set(rows.map(r => r.team))].sort().map(team => {
    const members = rows.filter(r => r.team === team);
    const perWeek = (fn: (r: CapacityRow, w: string) => number) =>
      Object.fromEntries(weeks.map(w => [w, members.reduce((s, m) => s + fn(m, w), 0)]));
    return {
      team,
      members: members.length,
      capacity: perWeek(m => m.weeklyCapacity),
      planned: perWeek((m, w) => m.allocated[w]),
      logged: perWeek((m, w) => logged.get(m.userId)?.get(w) || 0)
    };
  });

// Open first, then by priority (unset first), then earliest due date
export const compareByUrgency = (a: ServiceRequest, b: ServiceRequest) =>
  Number(isOpen(b)) - Number(isOpen(a)) ||
  priorityRank(a.priority) - priorityRank(b.priority) ||
  (a.dueDate || '9999').localeCompare(b.dueDate || '9999');

// Planned hours of a request that fall within the given weeks (only while it counts against capacity)
export const plannedInWeeks = (r: ServiceRequest, weeks: Set<string>, calendar: WorkCalendar = DEFAULT_CALENDAR): number => {
  if (!LOAD_STATUSES.includes(r.status) || !r.assigneeId) return 0;
  let total = 0;
  for (const [week, hours] of allocateByWeek(r, calendar)) if (weeks.has(week)) total += hours;
  return total;
};

// Hours logged on a request, optionally only within the given weeks and/or by the given people
export const loggedOn = (r: ServiceRequest, opts: { weeks?: Set<string>; byIds?: Set<string> } = {}): number =>
  (r.history || [])
    .filter(h => h.hours && (!opts.byIds || opts.byIds.has(h.byId)))
    .filter(h => !opts.weeks || opts.weeks.has(toDateKey(startOfWeek(new Date(h.at)))))
    .reduce((sum, h) => sum + (h.hours || 0), 0);

export const utilization = (allocated: number, capacity: number) =>
  capacity > 0 ? Math.round((allocated / capacity) * 100) : allocated > 0 ? 999 : 0;

// Heatmap cell colour for a utilization %
export const utilizationClass = (pct: number) =>
  pct === 0
    ? 'bg-gray-50 text-gray-400'
    : pct < 80
    ? 'bg-emerald-100 text-emerald-800'
    : pct <= 100
    ? 'bg-amber-100 text-amber-800'
    : 'bg-red-100 text-red-800';

export const formatHours = (hours: number) => `${Math.round(hours * 10) / 10}h`;
