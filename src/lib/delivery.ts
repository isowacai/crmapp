// Lightweight delivery visibility: schedule health, progress vs. time, blockers, and rollups.
// Management signals, not a project-management engine.
import { Blocker, ServiceRequest } from '../types';
import { parseDateKey, toDateKey } from './demand';

export type DeliveryHealth = 'not-started' | 'on-track' | 'at-risk' | 'late' | 'done';

export const HEALTH_STYLES: Record<DeliveryHealth, { label: string; badge: string }> = {
  'not-started': { label: 'Not started', badge: 'bg-gray-100 text-gray-700' },
  'on-track': { label: 'On track', badge: 'bg-emerald-100 text-emerald-800' },
  'at-risk': { label: 'At risk', badge: 'bg-amber-100 text-amber-800' },
  late: { label: 'Late', badge: 'bg-red-100 text-red-800' },
  done: { label: 'Done', badge: 'bg-emerald-100 text-emerald-800' }
};

const DAY = 86400000;

// Share of the planned window that has passed (0–1), or null without planned dates
export const elapsedFraction = (r: Pick<ServiceRequest, 'startDate' | 'dueDate'>, today = new Date()): number | null => {
  if (!r.startDate || !r.dueDate) return null;
  const start = parseDateKey(r.startDate).getTime();
  const end = parseDateKey(r.dueDate).getTime() + DAY; // inclusive of the due date
  const now = today.getTime();
  if (end <= start) return now >= end ? 1 : 0;
  return Math.min(Math.max((now - start) / (end - start), 0), 1);
};

export const openBlockers = (r: Pick<ServiceRequest, 'blockers'>): Blocker[] => (r.blockers || []).filter(b => !b.resolvedAt);

// How committed work is tracking against its plan. Only meaningful from Committed onwards.
//   late     – past the planned completion and not done
//   at-risk  – blocked, should have started but hasn't, a milestone is overdue,
//              or progress trails elapsed time by more than 25 points
export const deliveryHealth = (r: ServiceRequest, today = new Date()): DeliveryHealth | null => {
  if (r.status === 'completed') return 'done';
  if (!['committed', 'in-progress', 'blocked'].includes(r.status)) return null;
  const todayKey = toDateKey(today);

  if (r.dueDate && r.dueDate < todayKey) return 'late';
  if (r.status === 'blocked' || openBlockers(r).length > 0) return 'at-risk';
  if (r.status === 'committed') return r.startDate && r.startDate < todayKey ? 'at-risk' : 'not-started';
  if ((r.milestones || []).some(m => !m.done && m.dueDate && m.dueDate < todayKey)) return 'at-risk';

  const elapsed = elapsedFraction(r, today);
  if (elapsed !== null && elapsed * 100 - (r.progress || 0) > 25) return 'at-risk';
  return 'on-track';
};

// Actual minus estimated effort (hours); positive = took longer than estimated
export const effortVariance = (r: Pick<ServiceRequest, 'estimatedHours' | 'loggedHours'>) =>
  r.estimatedHours > 0 ? r.loggedHours - r.estimatedHours : null;

// Hours a blocker was (or has been) open
export const blockedHours = (b: Blocker, now = new Date()) =>
  ((b.resolvedAt ? new Date(b.resolvedAt) : now).getTime() - new Date(b.raisedAt).getTime()) / 3600000;

export const milestoneProgress = (r: Pick<ServiceRequest, 'milestones'>) => {
  const all = r.milestones || [];
  return { done: all.filter(m => m.done).length, total: all.length };
};

// Supporting requests raised under a request (from those the viewer can see)
export const childrenOf = (parentId: string, requests: ServiceRequest[]) => requests.filter(r => r.parentId === parentId);

// End-to-end rollup of a request and its supporting requests
export const rollup = (parent: ServiceRequest, requests: ServiceRequest[]) => {
  const children = childrenOf(parent.id, requests);
  const closed = ['completed', 'declined', 'cancelled'];
  return {
    children,
    teams: [...new Set(children.map(c => c.teamName).filter(Boolean))],
    done: children.filter(c => c.status === 'completed').length,
    open: children.filter(c => !closed.includes(c.status)).length,
    blocked: children.filter(c => c.status === 'blocked').length
  };
};

// Things worth confirming before marking work complete
export const completionWarnings = (r: ServiceRequest, requests: ServiceRequest[]): string[] => {
  const warnings: string[] = [];
  const openMilestones = (r.milestones || []).filter(m => !m.done);
  if (openMilestones.length) warnings.push(`${openMilestones.length} milestone(s) not marked done: ${openMilestones.map(m => m.title).join(', ')}`);

  const byId = new Map(requests.map(x => [x.id, x]));
  const unfinished = (r.dependsOn || []).filter(d => byId.get(d.id)?.status !== 'completed');
  if (unfinished.length) warnings.push(`Depends on unfinished work: ${unfinished.map(d => d.requestNumber).join(', ')}`);

  const openChildren = childrenOf(r.id, requests).filter(c => !['completed', 'declined', 'cancelled'].includes(c.status));
  if (openChildren.length) warnings.push(`Supporting requests still open: ${openChildren.map(c => `${c.requestNumber} (${c.teamName})`).join(', ')}`);
  return warnings;
};
