import { describe, expect, it } from 'vitest';
import { planMigration, slugify } from './teamsAndPipeline.js';

const now = new Date('2026-10-01T09:00:00Z');
const d = (id, data) => ({ id, data });

const input = () => ({
  teams: [],
  users: [
    d('m1', { role: 'manager', team: 'Data & Analytics' }),
    d('l1', { role: 'lead', team: 'IT Ops' }),
    d('s1', { role: 'customer', team: 'IT Ops' }),
    d('s2', { role: 'staff', team: '' }),
    d('s3', { role: 'staff', team: 'Unassigned' })
  ],
  services: [
    d('svc-data', { name: 'Extract', ownerTeam: 'Data & Analytics' }),
    d('svc-ops', { name: 'Laptop', ownerTeam: 'it ops' }), // different case, same team
    d('svc-none', { name: 'Orphan', ownerTeam: '' })
  ],
  requests: [
    d('R1', { status: 'submitted', priority: '', serviceId: 'svc-data', history: [{ action: 'Submitted' }] }),
    d('R2', { status: 'assigned', priority: 'P2', serviceId: 'svc-ops', assigneeId: 's1', history: [] }),
    d('R3', { status: 'on-hold', priority: 'P1', serviceId: 'svc-gone', assigneeId: 'l1', history: [] }),
    d('R4', { status: 'rejected', priority: 'P4', serviceId: 'svc-gone', history: [] }),
    d('R5', {
      status: 'committed', priority: 'high', teamId: 'it-ops', priorityScore: 70, calculatedPriority: 'high',
      priorityOverride: null, assessments: [], history: []
    })
  ]
});

describe('planMigration', () => {
  it('creates one team per distinct name, ignoring case and "Unassigned"', () => {
    const plan = planMigration(input(), now);
    expect(plan.teamsToCreate.map(t => [t.id, t.data.name])).toEqual([
      ['data-analytics', 'Data & Analytics'],
      ['it-ops', 'IT Ops']
    ]);
    expect(plan.teamsToCreate.find(t => t.id === 'it-ops').data.managerIds).toEqual(['l1']);
    expect(plan.teamsToCreate.find(t => t.id === 'data-analytics').data.managerIds).toEqual(['m1']);
  });

  it('reuses existing teams instead of duplicating them', () => {
    const plan = planMigration({ ...input(), teams: [d('ops', { name: 'IT Ops' })] }, now);
    expect(plan.teamsToCreate.map(t => t.id)).toEqual(['data-analytics']);
    expect(plan.userUpdates.find(u => u.id === 's1').patch).toEqual({ teamId: 'ops', team: 'IT Ops' });
  });

  it('links users and services to their team and reports services without one', () => {
    const plan = planMigration(input(), now);
    expect(plan.userUpdates.map(u => u.id).sort()).toEqual(['l1', 'm1', 's1']);
    expect(plan.serviceUpdates.find(s => s.id === 'svc-ops').patch).toEqual({ teamId: 'it-ops', ownerTeam: 'IT Ops' });
    expect(plan.unlinkedServices).toEqual(['svc-none']);
  });

  it('maps statuses and carries priorities over as clearly labelled manager priorities', () => {
    const plan = planMigration(input(), now);
    const r = id => plan.requestUpdates.find(u => u.id === id).patch;

    expect(r('R1')).toMatchObject({ status: 'new', teamId: 'data-analytics', teamName: 'Data & Analytics', assessments: [] });
    expect(r('R2')).toMatchObject({
      status: 'committed',
      priority: 'high',
      priorityScore: null,
      calculatedPriority: '',
      priorityOverride: { level: 'high', byName: 'Migration', reason: expect.stringContaining('(P2)') }
    });
    expect(r('R3')).toMatchObject({ status: 'blocked', priority: 'critical', teamId: 'it-ops' }); // team via assignee
    expect(r('R4')).toMatchObject({ status: 'declined', priority: 'low' });
  });

  it('records the migration in each changed request’s history', () => {
    const plan = planMigration(input(), now);
    const entry = plan.requestUpdates.find(u => u.id === 'R2').patch.history.at(-1);
    expect(entry).toEqual({
      at: now.toISOString(),
      byId: 'migration',
      byName: 'Migration',
      action: 'Moved to the demand pipeline; priority kept as High',
      toStatus: 'committed',
      changes: [
        { field: 'status', from: 'assigned', to: 'committed' },
        { field: 'priority', from: 'P2', to: 'high' }
      ]
    });
    // Existing history is preserved
    expect(plan.requestUpdates.find(u => u.id === 'R1').patch.history[0]).toEqual({ action: 'Submitted' });
  });

  it('reports requests it cannot place in a team, and skips already-migrated ones', () => {
    const plan = planMigration(input(), now);
    expect(plan.unownedRequests).toEqual(['R4']);
    expect(plan.requestUpdates.map(u => u.id)).not.toContain('R5');
  });

  it('is idempotent once applied', () => {
    const first = planMigration(input(), now);
    const apply = (items, updates) => items.map(i => ({ ...i, data: { ...i.data, ...(updates.find(u => u.id === i.id)?.patch ?? {}) } }));
    const after = {
      teams: first.teamsToCreate,
      users: apply(input().users, first.userUpdates),
      services: apply(input().services, first.serviceUpdates),
      requests: apply(input().requests, first.requestUpdates)
    };
    const second = planMigration(after, now);
    expect(second.teamsToCreate).toEqual([]);
    expect(second.userUpdates).toEqual([]);
    expect(second.serviceUpdates).toEqual([]);
    expect(second.requestUpdates).toEqual([]);
    expect(second.unownedRequests).toEqual(['R4']); // still reported: it has no team to belong to
  });
});

describe('slugify', () => {
  it('makes readable IDs', () => {
    expect(slugify('Data & Analytics')).toBe('data-analytics');
    expect(slugify('  ')).toBe('team');
  });
});
