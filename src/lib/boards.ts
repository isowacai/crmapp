// The demand pipeline split into boards shown one at a time on the Demand page
import { RequestStatus, ServiceRequest } from '../types';
import { firestoreDate } from './demand';

export const COMPLETED_WINDOW_DAYS = 30;

export type BoardKey = 'intake' | 'delivery' | 'closed';

// The pipeline split into boards shown one at a time: decisions first, then delivery
export const BOARDS: { key: BoardKey; title: string; subtitle: string; columns: RequestStatus[] }[] = [
  {
    key: 'intake',
    title: 'Intake & planning',
    subtitle: 'Demand waiting for a decision: assess, prioritize, and plan',
    columns: ['new', 'assessing', 'approved', 'planned']
  },
  {
    key: 'delivery',
    title: 'Delivery',
    subtitle: 'Work the team has committed to, through to completion',
    columns: ['committed', 'in-progress', 'blocked', 'completed']
  },
  {
    key: 'closed',
    title: 'Closed without delivery',
    subtitle: 'Deferred, declined, or cancelled demand',
    columns: ['deferred', 'declined', 'cancelled']
  }
];

// Completed work only stays on the Delivery board for this long
export const onBoard = (r: ServiceRequest, status: RequestStatus, now = Date.now()) =>
  r.status === status &&
  (status !== 'completed' || (firestoreDate(r.completedAt)?.getTime() ?? 0) >= now - COMPLETED_WINDOW_DAYS * 86400000);

// How many requests each board holds, for the board selector
export const boardCounts = (requests: ServiceRequest[]): Record<BoardKey, number> => {
  const now = Date.now();
  return Object.fromEntries(
    BOARDS.map(b => [b.key, requests.filter(r => b.columns.some(status => onBoard(r, status, now))).length])
  ) as Record<BoardKey, number>;
};
