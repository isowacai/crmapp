// Aggregates for the management dashboard (pure functions; the page only renders them)
import { ServiceRequest } from '../types';
import { compareByUrgency, firestoreDate, isOpen, toDateKey, addDays } from './demand';

const DAY = 86400000;

export const AGE_BUCKETS = [
  { key: 'week', label: '< 1 week', maxDays: 7 },
  { key: 'month', label: '1–4 weeks', maxDays: 28 },
  { key: 'quarter', label: '1–3 months', maxDays: 91 },
  { key: 'older', label: '3 months +', maxDays: Infinity }
] as const;

export const ageInDays = (r: ServiceRequest, now = new Date()) => {
  const created = firestoreDate(r.createdAt);
  return created ? (now.getTime() - created.getTime()) / DAY : 0;
};

// Open demand grouped by how long ago it was raised
export const agingBuckets = (requests: ServiceRequest[], now = new Date()) =>
  AGE_BUCKETS.map((b, i) => {
    const min = i === 0 ? 0 : AGE_BUCKETS[i - 1].maxDays;
    const items = requests.filter(r => isOpen(r) && ageInDays(r, now) >= min && ageInDays(r, now) < b.maxDays);
    return { ...b, items };
  });

// Critical / high demand the team hasn't committed to yet, most urgent first
export const highestPriorityUncommitted = (requests: ServiceRequest[]) =>
  requests
    .filter(r => ['new', 'assessing', 'approved', 'planned'].includes(r.status) && (r.priority === 'critical' || r.priority === 'high'))
    .sort(compareByUrgency);

// Committed work due in the next `days` days
export const upcomingCommitments = (requests: ServiceRequest[], days = 14, now = new Date()) => {
  const from = toDateKey(now);
  const to = toDateKey(addDays(now, days));
  return requests
    .filter(r => ['committed', 'in-progress', 'blocked'].includes(r.status) && r.dueDate >= from && r.dueDate <= to)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
};

// Demand by requesting business area (the requester's team), largest first
export const demandByArea = (requests: ServiceRequest[]) => {
  const counts = new Map<string, ServiceRequest[]>();
  for (const r of requests) {
    const area = r.requesterTeam || 'Not specified';
    counts.set(area, [...(counts.get(area) ?? []), r]);
  }
  return [...counts.entries()].map(([area, items]) => ({ area, items })).sort((a, b) => b.items.length - a.items.length);
};

export const completedSince = (requests: ServiceRequest[], days: number, now = new Date()) =>
  requests.filter(r => r.status === 'completed' && (firestoreDate(r.completedAt)?.getTime() ?? 0) >= now.getTime() - days * DAY);

export const createdSince = (requests: ServiceRequest[], days: number, now = new Date()) =>
  requests.filter(r => (firestoreDate(r.createdAt)?.getTime() ?? 0) >= now.getTime() - days * DAY);
