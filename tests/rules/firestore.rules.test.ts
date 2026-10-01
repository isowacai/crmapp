// Firestore security rules tests. Run with `npm run test:rules` (starts the Firestore emulator).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  or,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';

let env: RulesTestEnvironment;

// Two teams: ops (manager, lead, worker) and data (dataLead)
const USERS = {
  admin: { role: 'admin', teamId: '' },
  manager: { role: 'manager', teamId: 'ops' },
  lead: { role: 'lead', teamId: 'ops' },
  dataLead: { role: 'lead', teamId: 'data' },
  staff: { role: 'staff', teamId: '' },
  worker: { role: 'staff', teamId: 'ops' },
  legacy: { role: 'customer' }
} as const;
type Uid = keyof typeof USERS;

const db = (uid: Uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const entry = (byId: string, action = 'Comment') => ({ at: '2026-09-30T12:00:00.000Z', byId, byName: byId, action });

const newDemand = (id: string, requesterId: string, teamId = 'ops', serviceId = teamId === 'ops' ? 's-ops' : 's-data') => ({
  requestNumber: id,
  teamId,
  serviceId,
  requesterId,
  status: 'new',
  assigneeId: '',
  priority: '',
  priorityOverride: null,
  assessments: [],
  estimatedHours: 0,
  loggedHours: 0,
  completedAt: '',
  title: 'Need a report',
  history: [entry(requesterId, 'Submitted')]
});

const committedTo = (id: string, requesterId: string, assigneeId: string) => ({
  ...newDemand(id, requesterId),
  status: 'committed',
  assigneeId,
  priority: 'high',
  estimatedHours: 6
});

const OPS_NEW = 'REQ-20260930-0001';
const OPS_COMMITTED = 'REQ-20260930-0002';
const DATA_NEW = 'REQ-20260930-0003';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-crmapp',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const admin = ctx.firestore();
    for (const [uid, profile] of Object.entries(USERS)) {
      await setDoc(doc(admin, 'users', uid), { ...profile, displayName: uid });
    }
    await setDoc(doc(admin, 'teams', 'ops'), { name: 'Ops', managerIds: ['manager'] });
    await setDoc(doc(admin, 'teams', 'data'), { name: 'Data', managerIds: ['dataLead'] });
    await setDoc(doc(admin, 'services', 's-ops'), { name: 'Report', teamId: 'ops', ownerTeam: 'Ops', active: true });
    await setDoc(doc(admin, 'services', 's-data'), { name: 'Extract', teamId: 'data', ownerTeam: 'Data', active: true });
    await setDoc(doc(admin, 'requests', OPS_NEW), newDemand(OPS_NEW, 'staff'));
    await setDoc(doc(admin, 'requests', OPS_COMMITTED), committedTo(OPS_COMMITTED, 'manager', 'worker'));
    await setDoc(doc(admin, 'requests', DATA_NEW), newDemand(DATA_NEW, 'staff', 'data'));
    await setDoc(doc(admin, 'orders', 'o1'), { total: 10 });
  });
});

describe('users', () => {
  it('lets signed-in users read profiles but not anonymous visitors', async () => {
    await assertSucceeds(getDoc(doc(db('staff'), 'users', 'manager')));
    await assertFails(getDoc(doc(anon(), 'users', 'manager')));
  });

  it('only lets people register themselves as staff', async () => {
    await assertSucceeds(setDoc(doc(db('newbie' as Uid), 'users', 'newbie'), { role: 'staff', displayName: 'N' }));
    await assertFails(setDoc(doc(db('sneaky' as Uid), 'users', 'sneaky'), { role: 'admin', displayName: 'S' }));
    await assertFails(setDoc(doc(db('staff'), 'users', 'someone-else'), { role: 'staff' }));
  });

  it('stops staff changing their own role, team, or capacity', async () => {
    await assertSucceeds(updateDoc(doc(db('staff'), 'users', 'staff'), { displayName: 'New name' }));
    await assertFails(updateDoc(doc(db('staff'), 'users', 'staff'), { role: 'admin' }));
    await assertFails(updateDoc(doc(db('staff'), 'users', 'staff'), { teamId: 'ops' }));
    await assertFails(updateDoc(doc(db('staff'), 'users', 'staff'), { weeklyCapacityHours: 5 }));
  });

  it('lets managers set team names/membership but only admins change roles', async () => {
    await assertSucceeds(updateDoc(doc(db('manager'), 'users', 'staff'), { team: 'Ops', teamId: 'ops' }));
    await assertFails(updateDoc(doc(db('manager'), 'users', 'staff'), { role: 'lead' }));
    await assertFails(updateDoc(doc(db('lead'), 'users', 'staff'), { team: 'Platform' }));
    await assertSucceeds(updateDoc(doc(db('admin'), 'users', 'staff'), { role: 'lead', weeklyCapacityHours: 30 }));
    await assertFails(deleteDoc(doc(db('manager'), 'users', 'staff')));
  });
});

describe('teams', () => {
  it('lets everyone read teams but only admins create or delete them', async () => {
    await assertSucceeds(getDoc(doc(db('staff'), 'teams', 'ops')));
    await assertFails(setDoc(doc(db('manager'), 'teams', 'new'), { name: 'New' }));
    await assertSucceeds(setDoc(doc(db('admin'), 'teams', 'new'), { name: 'New' }));
    await assertFails(deleteDoc(doc(db('manager'), 'teams', 'ops')));
  });

  it("lets a team's leads and managers configure only their own workspace", async () => {
    const model = { priorityThresholds: { critical: 85, high: 65, medium: 45 } };
    await assertSucceeds(updateDoc(doc(db('lead'), 'teams', 'ops'), model));
    await assertSucceeds(updateDoc(doc(db('manager'), 'teams', 'ops'), { description: 'Platform ops' }));
    await assertFails(updateDoc(doc(db('dataLead'), 'teams', 'ops'), model));
    await assertFails(updateDoc(doc(db('worker'), 'teams', 'ops'), model));
    await assertSucceeds(updateDoc(doc(db('admin'), 'teams', 'data'), model));
  });
});

describe('service catalog', () => {
  it('is readable by everyone signed in', async () => {
    await assertSucceeds(getDoc(doc(db('staff'), 'services', 's-ops')));
  });

  it("lets managers edit only their own team's services", async () => {
    await assertSucceeds(updateDoc(doc(db('manager'), 'services', 's-ops'), { name: 'Reports' }));
    await assertFails(updateDoc(doc(db('manager'), 'services', 's-data'), { name: 'x' }));
    await assertFails(updateDoc(doc(db('manager'), 'services', 's-ops'), { teamId: 'data' }));
    await assertSucceeds(setDoc(doc(db('manager'), 'services', 's-new'), { name: 'New', teamId: 'ops' }));
    await assertFails(setDoc(doc(db('manager'), 'services', 's-new2'), { name: 'New', teamId: 'data' }));
    await assertFails(updateDoc(doc(db('lead'), 'services', 's-ops'), { name: 'x' }));
    await assertSucceeds(updateDoc(doc(db('admin'), 'services', 's-data'), { name: 'Extracts' }));
  });

  it('keeps categories editable by managers only', async () => {
    await assertSucceeds(setDoc(doc(db('manager'), 'categories', 'c1'), { name: 'IT' }));
    await assertFails(setDoc(doc(db('staff'), 'categories', 'c2'), { name: 'IT' }));
  });
});

describe('reading demand', () => {
  it("limits leads and managers to their own team's demand", async () => {
    await assertSucceeds(getDoc(doc(db('lead'), 'requests', OPS_NEW)));
    await assertFails(getDoc(doc(db('lead'), 'requests', DATA_NEW)));
    await assertSucceeds(getDoc(doc(db('dataLead'), 'requests', DATA_NEW)));
    await assertSucceeds(getDoc(doc(db('admin'), 'requests', DATA_NEW)));
  });

  it('lets staff read only what they raised or own', async () => {
    await assertSucceeds(getDoc(doc(db('staff'), 'requests', OPS_NEW)));
    await assertFails(getDoc(doc(db('staff'), 'requests', OPS_COMMITTED)));
    await assertSucceeds(getDoc(doc(db('worker'), 'requests', OPS_COMMITTED)));
    await assertFails(getDoc(doc(db('legacy'), 'requests', OPS_NEW)));
  });

  it("allows the app's scoped queries and refuses unscoped ones", async () => {
    const leadQuery = query(
      collection(db('lead'), 'requests'),
      or(where('teamId', '==', 'ops'), where('requesterId', '==', 'lead'), where('assigneeId', '==', 'lead'))
    );
    await assertSucceeds(getDocs(leadQuery));
    await assertFails(getDocs(collection(db('lead'), 'requests')));

    const staffQuery = query(collection(db('staff'), 'requests'), or(where('requesterId', '==', 'staff'), where('assigneeId', '==', 'staff')));
    await assertSucceeds(getDocs(staffQuery));
    await assertFails(getDocs(collection(db('staff'), 'requests')));

    await assertSucceeds(getDocs(collection(db('admin'), 'requests')));
  });

  it('lets anyone check that an unused request number is free', async () => {
    await assertSucceeds(getDoc(doc(db('staff'), 'requests', 'REQ-20260930-0099')));
  });
});

describe('raising demand', () => {
  it('numbers and creates a request in one transaction', async () => {
    const staffDb = db('staff');
    await assertSucceeds(runTransaction(staffDb, async tx => {
      const counterRef = doc(staffDb, 'counters', 'REQ-20260930');
      const counter = await tx.get(counterRef);
      const next = (counter.exists() ? counter.data().last : 3) + 1;
      const id = `REQ-20260930-000${next}`;
      tx.set(counterRef, { last: next });
      tx.set(doc(staffDb, 'requests', id), newDemand(id, 'staff'));
    }));
  });

  it("must be owned by the service's team", async () => {
    const id = 'REQ-20260930-0010';
    await assertFails(setDoc(doc(db('staff'), 'requests', id), newDemand(id, 'staff', 'data', 's-ops')));
    await assertSucceeds(setDoc(doc(db('staff'), 'requests', id), newDemand(id, 'staff', 'data', 's-data')));
  });

  it('refuses demand raised for someone else, or arriving assessed or prioritized', async () => {
    const id = 'REQ-20260930-0011';
    await assertFails(setDoc(doc(db('staff'), 'requests', id), newDemand(id, 'manager')));
    await assertFails(setDoc(doc(db('staff'), 'requests', id), { ...newDemand(id, 'staff'), priority: 'critical' }));
    await assertFails(setDoc(doc(db('staff'), 'requests', id), { ...newDemand(id, 'staff'), status: 'approved' }));
    await assertFails(setDoc(doc(db('staff'), 'requests', id), { ...newDemand(id, 'staff'), assessments: [{ score: 100 }] }));
    await assertFails(setDoc(doc(db('staff'), 'requests', 'wrong-id'), newDemand(id, 'staff')));
  });

  it("never overwrites someone else's request with the same number", async () => {
    await assertFails(setDoc(doc(db('staff'), 'requests', OPS_COMMITTED), newDemand(OPS_COMMITTED, 'staff')));
  });

  it('only lets counters count up by one', async () => {
    await assertSucceeds(setDoc(doc(db('staff'), 'counters', 'REQ-20261001'), { last: 1 }));
    await assertSucceeds(setDoc(doc(db('staff'), 'counters', 'REQ-20261001'), { last: 2 }));
    await assertFails(setDoc(doc(db('staff'), 'counters', 'REQ-20261001'), { last: 1 }));
    await assertFails(setDoc(doc(db('staff'), 'counters', 'hack'), { last: 1 }));
  });
});

describe('managing demand', () => {
  const ref = (uid: Uid, id: string) => doc(db(uid), 'requests', id);
  // Mirrors the app's writes: one appended history entry plus the updatedAt stamp useFirestore adds
  const withEntry = (uid: string, prior = 1) => ({
    history: [...Array(prior)].map(() => entry('x')).concat(entry(uid)),
    updatedAt: new Date()
  });

  it("lets the owning team's leads assess, prioritize, and commit", async () => {
    await assertSucceeds(updateDoc(ref('lead', OPS_NEW), {
      status: 'approved', priority: 'high', priorityScore: 72, assessments: [{ score: 72 }], ...withEntry('lead')
    }));
  });

  it("stops other teams' leads touching it, and stops moving demand between teams", async () => {
    await assertFails(updateDoc(ref('dataLead', OPS_NEW), { status: 'approved', ...withEntry('dataLead') }));
    await assertFails(updateDoc(ref('lead', OPS_NEW), { teamId: 'data', ...withEntry('lead') }));
    await assertSucceeds(updateDoc(ref('admin', OPS_NEW), { teamId: 'data', ...withEntry('admin') }));
  });

  it('requires exactly one new history entry, written as yourself', async () => {
    await assertFails(updateDoc(ref('manager', OPS_NEW), { priority: 'high' }));
    await assertFails(updateDoc(ref('manager', OPS_NEW), { priority: 'high', ...withEntry('lead') }));
    await assertFails(updateDoc(ref('manager', OPS_NEW), { priority: 'high', history: [entry('x'), entry('manager'), entry('manager')] }));
  });

  it('lets the delivery owner work committed demand but not re-plan or reprioritize it', async () => {
    await assertSucceeds(updateDoc(ref('worker', OPS_COMMITTED), { status: 'in-progress', ...withEntry('worker') }));
    await assertFails(updateDoc(ref('worker', OPS_COMMITTED), { estimatedHours: 1, ...withEntry('worker', 2) }));
    await assertFails(updateDoc(ref('worker', OPS_COMMITTED), { priority: 'critical', ...withEntry('worker', 2) }));
    await assertFails(updateDoc(ref('worker', OPS_COMMITTED), { status: 'approved', ...withEntry('worker', 2) }));
    await assertFails(updateDoc(ref('worker', OPS_COMMITTED), { loggedHours: -1, ...withEntry('worker', 2) }));
  });

  it('lets the requester comment or cancel, and nothing else', async () => {
    await assertFails(updateDoc(ref('staff', OPS_NEW), { status: 'approved', ...withEntry('staff') }));
    await assertFails(updateDoc(ref('staff', OPS_NEW), { title: 'Changed', ...withEntry('staff') }));
    await assertFails(updateDoc(ref('staff', OPS_NEW), { priority: 'critical', ...withEntry('staff') }));
    await assertSucceeds(updateDoc(ref('staff', OPS_NEW), withEntry('staff')));
    // The comment above made the history two entries long
    await assertSucceeds(updateDoc(ref('staff', OPS_NEW), { status: 'cancelled', ...withEntry('staff', 2) }));
  });

  it("stops other staff touching requests that aren't theirs", async () => {
    await assertFails(updateDoc(ref('staff', OPS_COMMITTED), withEntry('staff')));
  });

  it('only lets admins delete requests', async () => {
    await assertFails(deleteDoc(ref('manager', OPS_NEW)));
    await assertSucceeds(deleteDoc(ref('admin', OPS_NEW)));
  });
});

describe('retired CRM data and unknown collections', () => {
  it('is read-only for admins and hidden from everyone else', async () => {
    await assertSucceeds(getDoc(doc(db('admin'), 'orders', 'o1')));
    await assertFails(getDoc(doc(db('manager'), 'orders', 'o1')));
    await assertFails(setDoc(doc(db('admin'), 'orders', 'o2'), { total: 1 }));
    await assertFails(setDoc(doc(db('admin'), 'anything', 'x'), { a: 1 }));
  });
});
