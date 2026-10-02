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
    // Delivered by two teams, each separately
    await setDoc(doc(admin, 'services', 's-shared'), { name: 'Access review', teamIds: ['data', 'ops'], active: true });
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

  it('lets managers add, remove, and set hours for their own team only; only admins change roles', async () => {
    // Add someone with no team, with their weekly hours
    await assertSucceeds(updateDoc(doc(db('manager'), 'users', 'staff'), { team: 'Ops', teamId: 'ops', weeklyCapacityHours: 30 }));
    // Can't take someone from another team, or put someone in another team
    await assertFails(updateDoc(doc(db('manager'), 'users', 'dataLead'), { team: 'Ops', teamId: 'ops' }));
    await assertFails(updateDoc(doc(db('manager'), 'users', 'worker'), { team: 'Data', teamId: 'data' }));
    // Remove their own member
    await assertSucceeds(updateDoc(doc(db('manager'), 'users', 'worker'), { team: '', teamId: '' }));
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

  it("lets managers edit only services their team delivers", async () => {
    await assertSucceeds(updateDoc(doc(db('manager'), 'services', 's-ops'), { name: 'Reports' }));
    await assertSucceeds(updateDoc(doc(db('manager'), 'services', 's-shared'), { description: 'Quarterly' }));
    await assertFails(updateDoc(doc(db('manager'), 'services', 's-data'), { name: 'x' }));
    await assertFails(updateDoc(doc(db('manager'), 'services', 's-ops'), { teamId: 'data' }));
    await assertSucceeds(setDoc(doc(db('manager'), 'services', 's-new'), { name: 'New', teamIds: ['ops'] }));
    await assertFails(setDoc(doc(db('manager'), 'services', 's-new2'), { name: 'New', teamIds: ['data'] }));
    await assertFails(setDoc(doc(db('manager'), 'services', 's-new3'), { name: 'New', teamIds: ['ops', 'data'] }));
    await assertFails(updateDoc(doc(db('lead'), 'services', 's-ops'), { name: 'x' }));
    await assertSucceeds(updateDoc(doc(db('admin'), 'services', 's-data'), { name: 'Extracts' }));
  });

  it('lets managers add or remove only their own team as a delivering team', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'services', 's-free'), { name: 'Free', teamId: '', active: true }));
    const deliver = (role: Uid, service: string, teamIds: string[], extra = {}) =>
      updateDoc(doc(db(role), 'services', service), { teamIds, teamId: '', ownerTeam: '', ...extra });
    // Start delivering: an unlinked service, or one another team already delivers
    await assertSucceeds(deliver('manager', 's-free', ['ops']));
    await assertSucceeds(deliver('manager', 's-data', ['data', 'ops']));
    await assertFails(deliver('lead', 's-free', ['ops']));
    // ...without dropping the other team, adding a third, or editing what they don't deliver yet
    await assertFails(deliver('dataLead', 's-ops', ['data']));
    await assertFails(updateDoc(doc(db('manager'), 'services', 's-shared'), { teamIds: ['ops'] }));
    await assertFails(updateDoc(doc(db('manager'), 'services', 's-shared'), { teamIds: ['data', 'ops', 'hr'] }));
    await assertFails(updateDoc(doc(db('manager'), 'services', 's-shared'), { teamIds: [] }));
    // Stop delivering: only their own team comes off
    await assertSucceeds(updateDoc(doc(db('manager'), 'services', 's-shared'), { teamIds: ['data'] }));
    await assertSucceeds(updateDoc(doc(db('admin'), 'services', 's-shared'), { teamIds: ['hr'] }));
  });

  it("doesn't let a manager edit a service while joining it", async () => {
    await assertFails(updateDoc(doc(db('manager'), 'services', 's-data'), { teamIds: ['data', 'ops'], name: 'Mine now' }));
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

  it("must be owned by one of the service's delivering teams", async () => {
    const id = 'REQ-20260930-0010';
    await assertFails(setDoc(doc(db('staff'), 'requests', id), newDemand(id, 'staff', 'data', 's-ops')));
    await assertSucceeds(setDoc(doc(db('staff'), 'requests', id), newDemand(id, 'staff', 'data', 's-data')));
    // A shared service: either delivering team, but no other
    await assertFails(setDoc(doc(db('staff'), 'requests', 'REQ-20260930-0012'), newDemand('REQ-20260930-0012', 'staff', 'hr', 's-shared')));
    await assertSucceeds(setDoc(doc(db('staff'), 'requests', 'REQ-20260930-0012'), newDemand('REQ-20260930-0012', 'staff', 'ops', 's-shared')));
    await assertSucceeds(setDoc(doc(db('staff'), 'requests', 'REQ-20260930-0013'), newDemand('REQ-20260930-0013', 'staff', 'data', 's-shared')));
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

describe('cross-team supporting requests and delivery tracking', () => {
  const CHILD = 'REQ-20260930-0020';
  // A Data-team request raised as part of the Ops team's OPS_NEW
  const supporting = (id: string, requesterId: string, parentTeamId = 'ops') => ({
    ...newDemand(id, requesterId, 'data', 's-data'),
    parentId: OPS_NEW,
    parentTeamId,
    parentNumber: OPS_NEW,
    parentTitle: 'Need a report',
    parentTeamName: 'Ops'
  });
  const withEntry = (uid: string, prior = 1) => ({
    history: [...Array(prior)].map(() => entry('x')).concat(entry(uid)),
    updatedAt: new Date()
  });

  it("lets the original team's leads raise one, noting it on the original in the same transaction", async () => {
    const managerDb = db('manager');
    await assertSucceeds(runTransaction(managerDb, async tx => {
      tx.set(doc(managerDb, 'requests', CHILD), supporting(CHILD, 'manager'));
      tx.update(doc(managerDb, 'requests', OPS_NEW), withEntry('manager'));
    }));
  });

  it("refuses supporting requests from outside the original's team, or pointing at the wrong team", async () => {
    await assertFails(setDoc(doc(db('staff'), 'requests', CHILD), supporting(CHILD, 'staff')));
    await assertFails(setDoc(doc(db('dataLead'), 'requests', CHILD), supporting(CHILD, 'dataLead')));
    await assertFails(setDoc(doc(db('manager'), 'requests', CHILD), supporting(CHILD, 'manager', 'data')));
  });

  it('gives the original team visibility, while the delivering team manages it', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'requests', CHILD), supporting(CHILD, 'manager')));
    await assertSucceeds(getDoc(doc(db('lead'), 'requests', CHILD)));
    await assertSucceeds(getDocs(query(
      collection(db('lead'), 'requests'),
      or(where('teamId', '==', 'ops'), where('parentTeamId', '==', 'ops'), where('requesterId', '==', 'lead'), where('assigneeId', '==', 'lead'))
    )));
    await assertFails(updateDoc(doc(db('lead'), 'requests', CHILD), { status: 'approved', ...withEntry('lead') }));
    await assertSucceeds(updateDoc(doc(db('dataLead'), 'requests', CHILD), { status: 'approved', ...withEntry('dataLead') }));
    await assertFails(updateDoc(doc(db('dataLead'), 'requests', CHILD), { parentId: '', parentTeamId: '', ...withEntry('dataLead', 2) }));
  });

  it('refuses new demand that arrives with delivery data already filled in', async () => {
    const id = 'REQ-20260930-0021';
    await assertFails(setDoc(doc(db('staff'), 'requests', id), { ...newDemand(id, 'staff'), progress: 50 }));
    await assertFails(setDoc(doc(db('staff'), 'requests', id), { ...newDemand(id, 'staff'), milestones: [{ title: 'x' }] }));
  });

  it('lets the delivery owner track progress, milestones, and blockers, but not dependencies', async () => {
    const ref = doc(db('worker'), 'requests', OPS_COMMITTED);
    await assertSucceeds(updateDoc(ref, { status: 'in-progress', actualStart: '2026-10-01T09:00:00Z', ...withEntry('worker') }));
    await assertSucceeds(updateDoc(ref, { progress: 40, milestones: [{ id: 'm', title: 'Draft', done: true }], ...withEntry('worker', 2) }));
    await assertSucceeds(updateDoc(ref, { status: 'blocked', blockers: [{ id: 'b', description: 'Access' }], ...withEntry('worker', 3) }));
    await assertFails(updateDoc(ref, { dependsOn: [{ id: 'X' }], ...withEntry('worker', 4) }));
  });
});

describe('outcomes and workspace settings', () => {
  const withEntry = (uid: string, prior = 1) => ({
    history: [...Array(prior)].map(() => entry('x')).concat(entry(uid)),
    updatedAt: new Date()
  });
  const outcome = { types: ['time-saved'], metrics: [], summary: 'Saved a day a week' };

  it("lets only the team's leads and managers record outcomes", async () => {
    await assertFails(updateDoc(doc(db('worker'), 'requests', OPS_COMMITTED), { outcome, ...withEntry('worker') }));
    await assertFails(updateDoc(doc(db('manager'), 'requests', OPS_COMMITTED), { outcome, ...withEntry('worker') }));
    await assertSucceeds(updateDoc(doc(db('manager'), 'requests', OPS_COMMITTED), { outcome, ...withEntry('manager') }));
  });

  it("lets a team's leads set its targets and rates, and their own members' rates", async () => {
    const settings = { serviceTargets: { responseDays: 1, assessmentDays: 3, commitmentDays: 5, deliveryDays: 10 }, hourlyRate: 90, currency: 'EUR' };
    await assertSucceeds(updateDoc(doc(db('lead'), 'teams', 'ops'), settings));
    await assertFails(updateDoc(doc(db('dataLead'), 'teams', 'ops'), settings));
    await assertSucceeds(updateDoc(doc(db('manager'), 'users', 'worker'), { hourlyRate: 200 }));
    await assertSucceeds(updateDoc(doc(db('lead'), 'users', 'worker'), { hourlyRate: 120, weeklyCapacityHours: 30 }));
    await assertFails(updateDoc(doc(db('dataLead'), 'users', 'worker'), { hourlyRate: 200 }));
    await assertFails(updateDoc(doc(db('worker'), 'users', 'worker'), { hourlyRate: 200 }));
    await assertSucceeds(updateDoc(doc(db('admin'), 'users', 'worker'), { hourlyRate: 200 }));
  });
});

describe('workspace setup', () => {
  it("honours a team's request access", async () => {
    await env.withSecurityRulesDisabled(ctx =>
      updateDoc(doc(ctx.firestore(), 'teams', 'ops'), { requestAccess: { mode: 'teams', teamIds: ['data'] } })
    );
    const id = 'REQ-20260930-0030';
    // staff has no team, so isn't on the allowed list
    await assertFails(setDoc(doc(db('staff'), 'requests', id), newDemand(id, 'staff')));
    // a member of an allowed team, and the delivering team itself, may request
    await assertSucceeds(setDoc(doc(db('dataLead'), 'requests', id), newDemand(id, 'dataLead')));
    await assertSucceeds(setDoc(doc(db('worker'), 'requests', 'REQ-20260930-0031'), newDemand('REQ-20260930-0031', 'worker')));
  });

  it("lets a team's leads set their own members' weekly capacity, and nothing else", async () => {
    await assertSucceeds(updateDoc(doc(db('lead'), 'users', 'worker'), { weeklyCapacityHours: 30 }));
    await assertFails(updateDoc(doc(db('lead'), 'users', 'worker'), { role: 'lead' }));
    await assertFails(updateDoc(doc(db('lead'), 'users', 'staff'), { weeklyCapacityHours: 30 })); // not in their team
    await assertFails(updateDoc(doc(db('dataLead'), 'users', 'worker'), { weeklyCapacityHours: 30 }));
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
