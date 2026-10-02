import { describe, expect, it } from 'vitest';
import {
  blockedHours,
  completionWarnings,
  deliveryHealth,
  effortVariance,
  elapsedFraction,
  milestoneProgress,
  rollup
} from './delivery';
import { ServiceRequest } from '../types';

const today = new Date(2026, 9, 10, 12); // Sat 10 Oct 2026, midday

const req = (overrides: Partial<ServiceRequest>): ServiceRequest =>
  ({
    id: 'R1',
    requestNumber: 'REQ-1',
    status: 'in-progress',
    startDate: '2026-10-01',
    dueDate: '2026-10-20',
    progress: 50,
    milestones: [],
    blockers: [],
    dependsOn: [],
    parentId: '',
    teamName: 'Ops',
    estimatedHours: 0,
    loggedHours: 0,
    ...overrides
  }) as ServiceRequest;

describe('deliveryHealth', () => {
  it('is on track when progress keeps pace with time', () => {
    expect(deliveryHealth(req({ progress: 40 }), today)).toBe('on-track');
  });

  it('is at risk when progress trails elapsed time by more than 25 points', () => {
    expect(deliveryHealth(req({ progress: 10 }), today)).toBe('at-risk');
  });

  it('is at risk when blocked, or when a milestone is overdue', () => {
    expect(deliveryHealth(req({ status: 'blocked' }), today)).toBe('at-risk');
    expect(deliveryHealth(req({ milestones: [{ id: 'm', title: 'Draft', dueDate: '2026-10-05', done: false, doneAt: '' }] }), today)).toBe('at-risk');
  });

  it('is late past the planned completion', () => {
    expect(deliveryHealth(req({ dueDate: '2026-10-09', progress: 90 }), today)).toBe('late');
  });

  it('flags committed work that should have started', () => {
    expect(deliveryHealth(req({ status: 'committed', startDate: '2026-10-05' }), today)).toBe('at-risk');
    expect(deliveryHealth(req({ status: 'committed', startDate: '2026-10-12' }), today)).toBe('not-started');
  });

  it("doesn't apply before commitment, and is done once completed", () => {
    expect(deliveryHealth(req({ status: 'approved' }), today)).toBeNull();
    expect(deliveryHealth(req({ status: 'completed', dueDate: '2026-01-01' }), today)).toBe('done');
  });
});

describe('measures', () => {
  it('computes elapsed share of the plan, inclusive of the due date', () => {
    expect(elapsedFraction(req({ startDate: '2026-10-10', dueDate: '2026-10-10' }), new Date(2026, 9, 10, 12))).toBe(0.5);
    expect(elapsedFraction(req({ startDate: '', dueDate: '' }), today)).toBeNull();
  });

  it('computes effort variance and blocked time', () => {
    expect(effortVariance(req({ estimatedHours: 10, loggedHours: 13 }))).toBe(3);
    expect(effortVariance(req({ estimatedHours: 0, loggedHours: 5 }))).toBeNull();
    expect(blockedHours({ id: 'b', description: '', raisedAt: '2026-10-01T09:00:00Z', raisedById: '', raisedByName: '', resolvedAt: '2026-10-02T09:00:00Z', resolution: '' })).toBe(24);
  });

  it('counts milestones', () => {
    expect(milestoneProgress(req({ milestones: [
      { id: 'a', title: 'A', dueDate: '', done: true, doneAt: 'x' },
      { id: 'b', title: 'B', dueDate: '', done: false, doneAt: '' }
    ] }))).toEqual({ done: 1, total: 2 });
  });
});

describe('cross-team rollup and completion warnings', () => {
  const parent = req({ id: 'P', requestNumber: 'REQ-P', teamName: 'Apps' });
  const children = [
    req({ id: 'C1', requestNumber: 'REQ-C1', parentId: 'P', teamName: 'Security', status: 'completed' }),
    req({ id: 'C2', requestNumber: 'REQ-C2', parentId: 'P', teamName: 'Infrastructure', status: 'blocked' }),
    req({ id: 'C3', requestNumber: 'REQ-C3', parentId: 'P', teamName: 'Security', status: 'new' })
  ];

  it('summarizes supporting requests across teams', () => {
    expect(rollup(parent, [parent, ...children])).toMatchObject({ teams: ['Security', 'Infrastructure'], done: 1, open: 2, blocked: 1 });
  });

  it('warns about open milestones, unfinished dependencies, and open supporting requests', () => {
    const r = req({
      ...parent,
      milestones: [{ id: 'm', title: 'Sign-off', dueDate: '', done: false, doneAt: '' }],
      dependsOn: [{ id: 'C1', requestNumber: 'REQ-C1', title: '' }, { id: 'X', requestNumber: 'REQ-X', title: '' }]
    });
    const warnings = completionWarnings(r, [r, ...children]);
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toMatch(/Sign-off/);
    expect(warnings[1]).toBe('Depends on unfinished work: REQ-X'); // REQ-C1 is completed; REQ-X isn't visible
    expect(warnings[2]).toMatch(/REQ-C2 \(Infrastructure\), REQ-C3 \(Security\)/);
  });
});
