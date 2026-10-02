import { describe, expect, it } from 'vitest';
import { boardCounts, onBoard } from './boards';
import { ServiceRequest } from '../types';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const req = (status: string, completedAt = '') => ({ status, completedAt }) as ServiceRequest;

describe('boards', () => {
  it('counts requests per board, one board at a time', () => {
    const requests = [req('new'), req('assessing'), req('planned'), req('committed'), req('blocked'), req('deferred'), req('cancelled')];
    expect(boardCounts(requests)).toEqual({ intake: 3, delivery: 2, closed: 2 });
  });

  it('only keeps recently completed work on the Delivery board', () => {
    expect(onBoard(req('completed', daysAgo(5)), 'completed')).toBe(true);
    expect(onBoard(req('completed', daysAgo(45)), 'completed')).toBe(false);
    expect(boardCounts([req('completed', daysAgo(5)), req('completed', daysAgo(45))]).delivery).toBe(1);
  });
});
