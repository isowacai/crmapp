import { describe, expect, it } from 'vitest';
import { isLegacyRequest, normalizeRequest } from './legacy';
import { ServiceRequest } from '../types';

const legacy = (overrides: Record<string, unknown>) =>
  ({ id: 'R1', status: 'submitted', priority: '', history: [], assigneeTeam: 'Ops', ...overrides }) as unknown as ServiceRequest;

describe('normalizeRequest', () => {
  it('maps old statuses and P1–P4 priorities to the pipeline', () => {
    expect(normalizeRequest(legacy({ status: 'submitted' })).status).toBe('new');
    expect(normalizeRequest(legacy({ status: 'assigned', priority: 'P2' }))).toMatchObject({ status: 'committed', priority: 'high' });
    expect(normalizeRequest(legacy({ status: 'on-hold', priority: 'P1' }))).toMatchObject({ status: 'blocked', priority: 'critical' });
    expect(normalizeRequest(legacy({ status: 'rejected', priority: 'P4' }))).toMatchObject({ status: 'declined', priority: 'low' });
    expect(normalizeRequest(legacy({ status: 'in-progress' })).status).toBe('in-progress');
  });

  it('fills fields the new screens rely on', () => {
    expect(normalizeRequest(legacy({}))).toMatchObject({
      teamId: '',
      teamName: 'Ops',
      priorityScore: null,
      calculatedPriority: '',
      priorityOverride: null,
      assessments: []
    });
  });

  it('dates old commitments from when they were assigned, and targets their due month', () => {
    const r = normalizeRequest(legacy({ status: 'assigned', assignedAt: '2026-07-05T10:00:00Z', dueDate: '2026-07-20' }));
    expect(r).toMatchObject({ committedAt: '2026-07-05T10:00:00Z', targetPeriod: '2026-07' });
    expect(normalizeRequest(legacy({ status: 'submitted' }))).toMatchObject({ committedAt: '', targetPeriod: '' });
  });

  it('fills delivery fields, dating the actual start from the history', () => {
    const r = normalizeRequest(legacy({ status: 'in-progress', history: [{ at: '2026-07-08T09:00:00Z', toStatus: 'in-progress' }] }));
    expect(r).toMatchObject({ actualStart: '2026-07-08T09:00:00Z', progress: 0, milestones: [], blockers: [], dependsOn: [], parentId: '' });
    expect(normalizeRequest(legacy({ status: 'completed' })).progress).toBe(100);
  });

  it('drops unknown priority values instead of passing them on', () => {
    expect(normalizeRequest(legacy({ priority: 'urgent!' })).priority).toBe('');
  });

  it('returns migrated requests unchanged', () => {
    const current = legacy({
      status: 'approved', priority: 'high', teamId: 'ops', assessments: [], committedAt: '', targetPeriod: '2026-11',
      milestones: [], blockers: [], dependsOn: [], parentId: '', outcome: null, answers: []
    });
    expect(normalizeRequest(current)).toBe(current);
    expect(isLegacyRequest(current)).toBe(false);
    expect(isLegacyRequest(legacy({ status: 'assigned', teamId: 'ops' }))).toBe(true);
  });
});
