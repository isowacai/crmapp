import { describe, expect, it } from 'vitest';
import { agingBuckets, completedSince, createdSince, demandByArea, highestPriorityUncommitted, upcomingCommitments } from './metrics';
import { ServiceRequest } from '../types';

const now = new Date('2026-10-20T12:00:00Z');
const daysAgo = (n: number) => ({ seconds: (now.getTime() - n * 86400000) / 1000, nanoseconds: 0 });

const req = (id: string, overrides: Partial<ServiceRequest>) =>
  ({ id, status: 'new', priority: '', dueDate: '', requesterTeam: '', createdAt: daysAgo(1), completedAt: '', ...overrides }) as ServiceRequest;

describe('dashboard metrics', () => {
  it('buckets open demand by age', () => {
    const buckets = agingBuckets(
      [req('a', { createdAt: daysAgo(2) }), req('b', { createdAt: daysAgo(10) }), req('c', { createdAt: daysAgo(100) }), req('d', { status: 'completed', createdAt: daysAgo(2) })],
      now
    );
    expect(buckets.map(b => b.items.map(r => r.id))).toEqual([['a'], ['b'], [], ['c']]);
  });

  it('lists critical and high demand not yet committed', () => {
    const list = highestPriorityUncommitted([
      req('low', { priority: 'low' }),
      req('high', { status: 'approved', priority: 'high' }),
      req('crit', { status: 'planned', priority: 'critical' }),
      req('committed', { status: 'committed', priority: 'critical' })
    ]);
    expect(list.map(r => r.id)).toEqual(['crit', 'high']);
  });

  it('lists commitments due soon, soonest first', () => {
    const list = upcomingCommitments(
      [
        req('later', { status: 'committed', dueDate: '2026-10-30' }),
        req('soon', { status: 'in-progress', dueDate: '2026-10-22' }),
        req('past', { status: 'committed', dueDate: '2026-10-10' }),
        req('far', { status: 'committed', dueDate: '2026-12-01' })
      ],
      14,
      now
    );
    expect(list.map(r => r.id)).toEqual(['soon', 'later']);
  });

  it('groups demand by business area and counts recent activity', () => {
    const rs = [req('a', { requesterTeam: 'Sales' }), req('b', { requesterTeam: 'Sales' }), req('c', {})];
    expect(demandByArea(rs).map(x => [x.area, x.items.length])).toEqual([['Sales', 2], ['Not specified', 1]]);
    expect(createdSince([req('new', { createdAt: daysAgo(3) }), req('old', { createdAt: daysAgo(40) })], 30, now).map(r => r.id)).toEqual(['new']);
    expect(completedSince([req('d', { status: 'completed', completedAt: '2026-10-15T00:00:00Z' })], 30, now)).toHaveLength(1);
  });
});
