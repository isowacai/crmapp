// Migration 001: teams (workspaces) + demand pipeline.
//   - creates a team for each team name used on users and services
//   - links users and services to their team (teamId)
//   - gives every request its owning team, maps old statuses to the pipeline
//     (submitted→new, assigned→committed, on-hold→blocked, rejected→declined),
//     and carries P1–P4 over as manager priorities (Critical/High/Medium/Low) with a clear note
// Safe to run more than once. Previews by default:
//   npm run migrate:teams             preview
//   npm run migrate:teams -- --apply  write the changes
import { db, projectId } from '../../config/firebaseAdmin.js';
import { planMigration } from './teamsAndPipeline.js';

const apply = process.argv.includes('--apply');
const BATCH_LIMIT = 400;

const load = async name => (await db.collection(name).get()).docs.map(d => ({ id: d.id, data: d.data() }));

const [users, services, requests, teams] = await Promise.all(['users', 'services', 'requests', 'teams'].map(load));
const plan = planMigration({ users, services, requests, teams });

console.log(`\n[${projectId}] Migration 001 — teams and demand pipeline${apply ? '' : ' (preview)'}\n`);
for (const t of plan.teamsToCreate) console.log(`+ team      ${t.id.padEnd(24)} "${t.data.name}" · ${t.data.managerIds.length} lead/manager(s)`);
for (const u of plan.userUpdates) console.log(`~ user      ${u.id.padEnd(24)} → team ${u.patch.teamId}`);
for (const s of plan.serviceUpdates) console.log(`~ service   ${s.id.padEnd(24)} → team ${s.patch.teamId}`);
for (const r of plan.requestUpdates) {
  const parts = [];
  if (r.patch.teamId) parts.push(`team ${r.patch.teamId}`);
  if (r.patch.status) parts.push(`status ${r.patch.status}`);
  if (r.patch.priorityOverride) parts.push(`priority ${r.patch.priority}`);
  console.log(`~ request   ${r.id.padEnd(24)} ${parts.join(' · ') || 'add pipeline fields'}`);
}
for (const id of plan.unlinkedServices) console.log(`! service   ${id.padEnd(24)} has no team; set one in the Service Catalog`);
for (const id of plan.unownedRequests) console.log(`! request   ${id.padEnd(24)} has no team (its service has none); an admin can still see it`);

const writes = [
  ...plan.teamsToCreate.map(t => ['teams', t.id, t.data, false]),
  ...plan.userUpdates.map(u => ['users', u.id, u.patch, true]),
  ...plan.serviceUpdates.map(s => ['services', s.id, s.patch, true]),
  ...plan.requestUpdates.map(r => ['requests', r.id, r.patch, true])
];

console.log(
  `\n${plan.teamsToCreate.length} teams to create · ${plan.userUpdates.length} users · ${plan.serviceUpdates.length} services · ` +
    `${plan.requestUpdates.length} requests to update`
);

if (!apply) {
  if (writes.length) console.log('Preview only. Run with -- --apply to write the changes.');
  process.exit(0);
}

const now = new Date();
for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
  const batch = db.batch();
  for (const [collection, id, data, merge] of writes.slice(i, i + BATCH_LIMIT)) {
    const ref = db.collection(collection).doc(id);
    if (merge) batch.set(ref, data, { merge: true });
    else batch.set(ref, { ...data, createdAt: now });
  }
  await batch.commit();
}
console.log(`Applied ${writes.length} changes.`);
