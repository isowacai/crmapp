import { describe, expect, it } from 'vitest';
import { averageStageDurations, evaluateTargets, stageDurations, stageTimes, targetPerformance, waitingIn } from './lifecycle';
import { RequestHistoryEntry, ServiceRequest } from '../types';

const ts = (iso: string) => ({ seconds: new Date(iso).getTime() / 1000, nanoseconds: 0 });
// Old requests stored statuses like 'assigned', so toStatus is a plain string here
const entry = (at: string, byId: string, toStatus?: string) =>
  ({ at, byId, byName: byId, action: 'x', ...(toStatus ? { toStatus } : {}) }) as unknown as RequestHistoryEntry;

// Submitted Oct 1, assessed/approved Oct 2, committed Oct 4, started Oct 5, completed Oct 9
const delivered = (overrides: Partial<ServiceRequest> = {}) =>
  ({
    id: 'R1',
    requesterId: 'req',
    status: 'completed',
    createdAt: ts('2026-10-01T09:00:00Z'),
    assessments: [{ at: '2026-10-02T09:00:00Z', decision: 'accept' }],
    committedAt: '2026-10-04T09:00:00Z',
    actualStart: '2026-10-05T09:00:00Z',
    completedAt: '2026-10-09T09:00:00Z',
    history: [
      entry('2026-10-01T09:00:00Z', 'req', 'new'),
      entry('2026-10-01T21:00:00Z', 'lead'), // first response: a comment 12h later
      entry('2026-10-02T09:00:00Z', 'lead', 'approved'),
      entry('2026-10-04T09:00:00Z', 'lead', 'committed'),
      entry('2026-10-05T09:00:00Z', 'jo', 'in-progress'),
      entry('2026-10-09T09:00:00Z', 'jo', 'completed')
    ],
    ...overrides
  }) as unknown as ServiceRequest;

describe('stage timing', () => {
  it('derives each stage from the history', () => {
    const t = stageTimes(delivered());
    expect(t.responded?.toISOString()).toBe('2026-10-01T21:00:00.000Z');
    expect(t.assessed?.toISOString()).toBe('2026-10-02T09:00:00.000Z');
    expect(t.approved?.toISOString()).toBe('2026-10-02T09:00:00.000Z');
  });

  it('measures days per stage', () => {
    expect(stageDurations(delivered())).toEqual({ assessment: 1, approval: 0, commitment: 2, start: 1, completion: 4 });
  });

  it('reads older requests triaged straight to "assigned"', () => {
    const legacy = delivered({
      assessments: [],
      committedAt: '',
      actualStart: '',
      history: [entry('2026-10-01T09:00:00Z', 'req', 'submitted'), entry('2026-10-03T09:00:00Z', 'lead', 'assigned'), entry('2026-10-04T09:00:00Z', 'jo', 'in-progress')]
    });
    expect(stageDurations(legacy)).toMatchObject({ assessment: 2, approval: 0, commitment: 0, start: 1 });
  });

  it('averages stages across requests and reports where open work is waiting', () => {
    const avg = averageStageDurations([delivered(), delivered({ completedAt: '2026-10-13T09:00:00Z' })]);
    expect(avg.find(s => s.key === 'completion')).toMatchObject({ count: 2, averageDays: 6 });
    const waiting = delivered({ status: 'approved', committedAt: '', actualStart: '', completedAt: '', history: [entry('2026-10-02T09:00:00Z', 'lead', 'approved')] });
    expect(waitingIn(waiting, new Date('2026-10-07T09:00:00Z'))).toEqual({ stage: 'commitment', days: 5 });
  });
});

describe('service targets', () => {
  const targets = { responseDays: 1, assessmentDays: 2, commitmentDays: 1, deliveryDays: 3 };

  it('marks each finished target met or missed', () => {
    const results = evaluateTargets(delivered(), targets);
    expect(results.map(r => [r.label, r.state])).toEqual([
      ['Initial response', 'met'],
      ['Assessment', 'met'],
      ['Commitment', 'missed'], // 2 days vs 1
      ['Delivery', 'missed'] // 5 days vs 3
    ]);
  });

  it('tracks pending targets as on time or overdue, and skips targets that are off or not started', () => {
    const open = delivered({ status: 'new', assessments: [], committedAt: '', actualStart: '', completedAt: '', history: [entry('2026-10-01T09:00:00Z', 'req', 'new')] });
    const results = evaluateTargets(open, { ...targets, responseDays: null }, new Date('2026-10-04T09:00:00Z'));
    expect(results.map(r => [r.label, r.state])).toEqual([['Assessment', 'overdue']]);
  });

  it("doesn't count pending targets on declined or cancelled demand", () => {
    const declined = delivered({
      status: 'declined', committedAt: '', actualStart: '', completedAt: '',
      history: [entry('2026-10-01T09:00:00Z', 'req', 'new'), entry('2026-10-01T21:00:00Z', 'lead'), entry('2026-10-02T09:00:00Z', 'lead', 'approved'), entry('2026-10-03T09:00:00Z', 'lead', 'declined')]
    });
    expect(evaluateTargets(declined, targets).map(r => r.label)).toEqual(['Initial response', 'Assessment']);
  });

  it('summarizes performance against each target', () => {
    const perf = targetPerformance([delivered(), delivered({ completedAt: '2026-10-06T09:00:00Z' })], () => targets);
    expect(perf.find(p => p.key === 'deliveryDays')).toMatchObject({ measured: 2, met: 1, metPct: 50 });
    expect(perf.find(p => p.key === 'responseDays')).toMatchObject({ metPct: 100 });
  });
});
