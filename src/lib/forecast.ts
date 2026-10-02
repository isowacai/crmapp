// Capacity forecasting and capacity checks for commitment decisions.
//   capacity  – each person's weekly hours, pro-rated by the team's working days in the period
//   committed – committed / in-progress work, spread over its planned dates (as in the weekly view)
//   demand    – approved and planned work not yet committed: spread over its planned dates if it has
//               them, otherwise counted in its target period or requested-completion month
import { ServiceRequest, User } from '../types';
import { DEFAULT_WEEKLY_CAPACITY } from './roles';
import { addDays, allocateByDay, DEFAULT_CALENDAR, isWorkingDay, LOAD_STATUSES, parseDateKey, toDateKey, WorkCalendar } from './demand';

export type PeriodUnit = 'month' | 'quarter';

export interface Period {
  key: string; // YYYY-MM or YYYY-Qn
  label: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD, inclusive
}

export interface ForecastItem {
  request: ServiceRequest;
  hours: number;
}

export interface ForecastPeriod extends Period {
  capacity: number;
  committed: number;
  demand: number;
  remaining: number; // capacity − committed
  gap: number; // capacity − committed − demand; negative means demand exceeds capacity
  committedItems: ForecastItem[];
  demandItems: ForecastItem[];
}

// Approved/planned demand that isn't committed yet
export const DEMAND_STATUSES = ['approved', 'planned'] as const;

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const pad = (n: number) => String(n).padStart(2, '0');

export const monthKey = (dateKey: string) => dateKey.slice(0, 7);

export const periodKeyFor = (dateKey: string, unit: PeriodUnit) => {
  const [y, m] = dateKey.split('-').map(Number);
  return unit === 'month' ? `${y}-${pad(m)}` : `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
};

export const formatMonth = (key: string) =>
  key ? parseDateKey(`${key}-01`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '';

// `count` consecutive months or quarters starting with the one containing `from`
export const buildPeriods = (from: Date, unit: PeriodUnit, count: number): Period[] => {
  const step = unit === 'month' ? 1 : 3;
  let start = monthStart(from);
  if (unit === 'quarter') start = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
  return Array.from({ length: count }, (_, i) => {
    const s = new Date(start.getFullYear(), start.getMonth() + i * step, 1);
    const e = new Date(s.getFullYear(), s.getMonth() + step, 0);
    const startKey = toDateKey(s);
    return {
      key: periodKeyFor(startKey, unit),
      label: unit === 'month'
        ? s.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
        : `Q${Math.floor(s.getMonth() / 3) + 1} ${s.getFullYear()}`,
      start: startKey,
      end: toDateKey(e)
    };
  });
};

export const workingDaysBetween = (startKey: string, endKey: string, calendar: WorkCalendar = DEFAULT_CALENDAR): number => {
  if (!startKey || !endKey || endKey < startKey) return 0;
  let count = 0;
  for (let d = parseDateKey(startKey); toDateKey(d) <= endKey; d = addDays(d, 1)) if (isWorkingDay(d, calendar)) count++;
  return count;
};

const activeUsers = (users: User[]) => users.filter(u => u.active !== false);

export const capacityBetween = (users: User[], startKey: string, endKey: string, calendar: WorkCalendar = DEFAULT_CALENDAR) => {
  const days = workingDaysBetween(startKey, endKey, calendar);
  const daysPerWeek = calendar.workingDays.length || 5;
  return activeUsers(users).reduce((sum, u) => sum + ((u.weeklyCapacityHours ?? DEFAULT_WEEKLY_CAPACITY) * days) / daysPerWeek, 0);
};

// ---------- Capacity check for one decision ----------

export interface CapacityCheck {
  start: string;
  end: string;
  available: number; // team capacity in the window
  committed: number; // existing committed work in the window
  remaining: number;
  effort: number;
  status: 'fits' | 'tight' | 'insufficient';
}

// Whether `effort` hours fit in the team's remaining capacity between `start` and `end`
export const checkCapacity = ({
  users,
  requests,
  effort,
  start,
  end,
  excludeId,
  calendar = DEFAULT_CALENDAR
}: {
  users: User[];
  requests: ServiceRequest[];
  effort: number;
  start: string;
  end: string;
  excludeId?: string;
  calendar?: WorkCalendar;
}): CapacityCheck => {
  const people = new Set(activeUsers(users).map(u => u.id));
  const available = capacityBetween(users, start, end, calendar);
  let committed = 0;
  for (const r of requests) {
    if (r.id === excludeId || !LOAD_STATUSES.includes(r.status) || !people.has(r.assigneeId)) continue;
    for (const [day, hours] of allocateByDay(r, calendar)) if (day >= start && day <= end) committed += hours;
  }
  const remaining = available - committed;
  const status = effort > remaining ? 'insufficient' : remaining - effort < available * 0.2 ? 'tight' : 'fits';
  return { start, end, available, committed, remaining, effort, status };
};

// The window a capacity check should look at: the planned dates if set, otherwise from today to the
// requested completion date (or the end of the target period), otherwise the next four weeks
export const decisionWindow = (r: Pick<ServiceRequest, 'startDate' | 'dueDate' | 'neededBy' | 'targetPeriod'>, today = new Date()) => {
  const todayKey = toDateKey(today);
  if (r.startDate && r.dueDate) return { start: r.startDate, end: r.dueDate, basis: 'planned dates' as const };
  if (r.neededBy && r.neededBy >= todayKey) return { start: todayKey, end: r.neededBy, basis: 'requested completion' as const };
  if (r.targetPeriod) {
    const s = parseDateKey(`${r.targetPeriod}-01`);
    const end = toDateKey(new Date(s.getFullYear(), s.getMonth() + 1, 0));
    if (end >= todayKey) return { start: todayKey > toDateKey(s) ? todayKey : toDateKey(s), end, basis: 'target period' as const };
  }
  return { start: todayKey, end: toDateKey(addDays(today, 27)), basis: 'next four weeks' as const };
};

// ---------- Forecast ----------

export const buildForecast = ({
  users,
  requests,
  teamIds,
  periods,
  unit,
  calendar = DEFAULT_CALENDAR
}: {
  users: User[]; // whose capacity and committed work to count
  requests: ServiceRequest[];
  teamIds?: Set<string>; // limit approved demand to these teams; omit for all
  periods: Period[];
  unit: PeriodUnit;
  calendar?: WorkCalendar;
}): { periods: ForecastPeriod[]; unscheduled: ForecastItem[] } => {
  const people = new Set(activeUsers(users).map(u => u.id));
  const index = new Map(periods.map((p, i) => [p.key, i]));
  const first = periods[0];
  const last = periods[periods.length - 1];

  const result: ForecastPeriod[] = periods.map(p => ({
    ...p,
    capacity: capacityBetween(users, p.start, p.end, calendar),
    committed: 0,
    demand: 0,
    remaining: 0,
    gap: 0,
    committedItems: [],
    demandItems: []
  }));
  const unscheduled: ForecastItem[] = [];

  const addSpread = (r: ServiceRequest, kind: 'committed' | 'demand') => {
    const perPeriod = new Map<number, number>();
    for (const [day, hours] of allocateByDay(r, calendar)) {
      // Work planned before the horizon that isn't done yet still needs capacity: count it in the first period
      const i = day < first.start ? 0 : index.get(periodKeyFor(day, unit));
      if (i === undefined) continue;
      perPeriod.set(i, (perPeriod.get(i) || 0) + hours);
    }
    for (const [i, hours] of perPeriod) {
      result[i][kind] += hours;
      result[i][kind === 'committed' ? 'committedItems' : 'demandItems'].push({ request: r, hours });
    }
  };

  for (const r of requests) {
    if (LOAD_STATUSES.includes(r.status)) {
      if (people.has(r.assigneeId)) addSpread(r, 'committed');
      continue;
    }
    if (!(DEMAND_STATUSES as readonly string[]).includes(r.status) || !(r.estimatedHours > 0)) continue;
    if (teamIds && !teamIds.has(r.teamId)) continue;

    if (r.status === 'planned' && r.startDate) {
      addSpread(r, 'demand');
      continue;
    }
    const target = r.targetPeriod || (r.neededBy ? monthKey(r.neededBy) : '');
    if (!target) {
      unscheduled.push({ request: r, hours: r.estimatedHours });
      continue;
    }
    const targetStart = `${target}-01`;
    if (targetStart > last.end) continue; // beyond the horizon
    const i = targetStart < first.start ? 0 : index.get(periodKeyFor(targetStart, unit));
    if (i === undefined) continue;
    result[i].demand += r.estimatedHours;
    result[i].demandItems.push({ request: r, hours: r.estimatedHours });
  }

  for (const p of result) {
    p.remaining = p.capacity - p.committed;
    p.gap = p.capacity - p.committed - p.demand;
    p.committedItems.sort((a, b) => b.hours - a.hours);
    p.demandItems.sort((a, b) => b.hours - a.hours);
  }
  return { periods: result, unscheduled };
};
