// Read-only check before deploying firestore.rules: finds data the rules would treat badly
// (people without a role or team, services or requests without a team, old-format statuses).
//   npm run check-rules-readiness
import { db, projectId } from '../config/firebaseAdmin.js';

const LEGACY_STATUSES = ['submitted', 'assigned', 'on-hold', 'rejected'];
const ROLES = ['admin', 'manager', 'lead', 'staff'];

const all = async name => (await db.collection(name).get()).docs.map(d => ({ id: d.id, ...d.data() }));
const [users, teams, services, requests] = await Promise.all(['users', 'teams', 'services', 'requests'].map(all));
const teamIds = new Set(teams.map(t => t.id));
// Services list their delivering teams; ones saved before multi-team delivery have a single teamId
const delivering = s => (Array.isArray(s.teamIds) ? s.teamIds : s.teamId ? [s.teamId] : []);

const problems = [];
const warnings = [];

const admins = users.filter(u => u.role === 'admin');
if (admins.length === 0) problems.push('No user has the admin role — nobody could manage users after the rules go live.');

for (const u of users) {
  const who = `${u.displayName || u.email || u.id}`;
  if (!ROLES.includes(u.role)) warnings.push(`User ${who}: role "${u.role ?? '(none)'}" will be treated as staff.`);
  if ((u.role === 'lead' || u.role === 'manager') && !u.teamId) problems.push(`User ${who} is a ${u.role} but has no team, so would see only their own requests.`);
  if (u.teamId && !teamIds.has(u.teamId)) problems.push(`User ${who} belongs to a team that doesn't exist (${u.teamId}).`);
}
for (const s of services) {
  if (delivering(s).length === 0) problems.push(`Service "${s.name}" has no team, so it can't be requested.`);
  for (const id of delivering(s)) if (!teamIds.has(id)) problems.push(`Service "${s.name}" points at a missing team (${id}).`);
}
for (const r of requests) {
  if (!r.teamId) problems.push(`Request ${r.id} has no team, so only admins and the people on it could see it.`);
  if (LEGACY_STATUSES.includes(r.status)) warnings.push(`Request ${r.id} still has the old status "${r.status}" (the app reads it correctly; migration 001 converts it).`);
  if (!Array.isArray(r.history) || r.history.length === 0) problems.push(`Request ${r.id} has no history, so the rules would refuse every update to it.`);
}

console.log(`\n[${projectId}] Readiness for firestore.rules`);
console.log(`${users.length} users (${admins.length} admin) · ${teams.length} teams · ${services.length} services · ${requests.length} requests\n`);
console.log('Teams:', teams.map(t => `${t.name} (${users.filter(u => u.teamId === t.id).length} people, ${services.filter(s => delivering(s).includes(t.id)).length} services)`).join(' · ') || 'none');
console.log('People:', users.map(u => `${u.displayName || u.email} [${u.role ?? 'none'}${u.teamId ? `, ${teams.find(t => t.id === u.teamId)?.name ?? u.teamId}` : ', no team'}]`).join(' · '));
console.log('');
for (const p of problems) console.log(`✗ ${p}`);
for (const w of warnings) console.log(`! ${w}`);
console.log(problems.length ? `\n${problems.length} problem(s) to fix before deploying.` : '\nNo blocking problems.');
process.exit(0);
