// End-to-end check of migration 001 against the Firestore emulator: seeds data in the old format,
// previews, applies, verifies the result, and re-runs to confirm nothing more changes.
// Run with `npm run test:migration` (which starts the emulator).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run via npm run test:migration (needs the emulator).');

const db = getFirestore(initializeApp({ projectId: 'demo-crmapp' }));
const run = (...args) =>
  execFileSync(process.execPath, ['scripts/migrations/001-teams-and-pipeline.js', ...args], { encoding: 'utf8', env: process.env });

// ---- Seed old-format data ----
const seed = {
  users: {
    m1: { displayName: 'Morgan', role: 'manager', team: 'Data & Analytics' },
    s1: { displayName: 'Sam', role: 'customer', team: 'IT Ops' },
    s2: { displayName: 'Ari', role: 'staff', team: '' }
  },
  services: {
    'svc-data': { name: 'Data extract', ownerTeam: 'Data & Analytics', active: true },
    'svc-ops': { name: 'Laptop', ownerTeam: 'IT Ops', active: true }
  },
  requests: {
    'REQ-20260705-0001': {
      requestNumber: 'REQ-20260705-0001', serviceId: 'svc-data', status: 'submitted', priority: '', impact: '', urgency: '',
      requesterId: 's2', assigneeId: '', estimatedHours: 0, loggedHours: 0, history: [{ action: 'Submitted', byId: 's2' }]
    },
    'REQ-20260705-0002': {
      requestNumber: 'REQ-20260705-0002', serviceId: 'svc-ops', status: 'assigned', priority: 'P2', impact: 'high', urgency: 'medium',
      requesterId: 's2', assigneeId: 's1', estimatedHours: 8, loggedHours: 0, history: [{ action: 'Submitted', byId: 's2' }]
    },
    'REQ-20260705-0003': {
      requestNumber: 'REQ-20260705-0003', serviceId: 'svc-ops', status: 'on-hold', priority: 'P1', impact: 'high', urgency: 'high',
      requesterId: 's2', assigneeId: 's1', estimatedHours: 4, loggedHours: 2, history: []
    }
  }
};
for (const [collection, docs] of Object.entries(seed)) {
  for (const [id, data] of Object.entries(docs)) await db.collection(collection).doc(id).set({ ...data, createdAt: new Date() });
}

// ---- Preview writes nothing ----
const preview = run();
assert.match(preview, /2 teams to create · 2 users · 2 services · 3 requests to update/);
assert.equal((await db.collection('teams').get()).size, 0, 'preview must not write');

// ---- Apply ----
assert.match(run('--apply'), /Applied 9 changes/);

const teams = Object.fromEntries((await db.collection('teams').get()).docs.map(d => [d.id, d.data()]));
assert.deepEqual(Object.keys(teams).sort(), ['data-analytics', 'it-ops']);
assert.deepEqual(teams['data-analytics'].managerIds, ['m1']);
assert.ok(teams['it-ops'].createdAt, 'teams need createdAt so the app lists them');

const user = async id => (await db.collection('users').doc(id).get()).data();
assert.equal((await user('s1')).teamId, 'it-ops');
assert.equal((await user('s2')).teamId, undefined, 'people without a team stay unassigned');

const svc = (await db.collection('services').doc('svc-data').get()).data();
assert.equal(svc.teamId, 'data-analytics');

const req = async id => (await db.collection('requests').doc(id).get()).data();
const r1 = await req('REQ-20260705-0001');
assert.equal(r1.status, 'new');
assert.equal(r1.teamId, 'data-analytics');
assert.equal(r1.priority, '');
assert.deepEqual(r1.assessments, []);
assert.equal(r1.priorityOverride, null);

const r2 = await req('REQ-20260705-0002');
assert.equal(r2.status, 'committed');
assert.equal(r2.priority, 'high');
assert.equal(r2.priorityOverride.level, 'high');
assert.match(r2.priorityOverride.reason, /\(P2\)/);
assert.equal(r2.history.length, 2, 'existing history kept, one migration entry added');
assert.equal(r2.history[1].byName, 'Migration');
assert.equal(r2.estimatedHours, 8, 'other fields untouched');

const r3 = await req('REQ-20260705-0003');
assert.equal(r3.status, 'blocked');
assert.equal(r3.priority, 'critical');
assert.equal(r3.loggedHours, 2);

// ---- Re-running finds nothing to do ----
assert.match(run(), /0 teams to create · 0 users · 0 services · 0 requests to update/);

console.log('Migration 001 end-to-end check passed.');
