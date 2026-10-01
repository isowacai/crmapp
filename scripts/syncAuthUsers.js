// Makes sure every Firebase Authentication account has a complete user profile in Firestore:
// creates missing profiles, fills in missing fields, and converts the retired 'customer' role to 'staff'.
// Previews by default; run with --apply to write.
//   npm run sync-users            preview
//   npm run sync-users -- --apply write the changes
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { auth, db, projectId } from '../config/firebaseAdmin.js';

const apply = process.argv.includes('--apply');
const DEFAULT_WEEKLY_CAPACITY = 40;

const listAllAuthUsers = async () => {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
};

const authUsers = await listAllAuthUsers();
const profiles = new Map((await db.collection('users').get()).docs.map(d => [d.id, d.data()]));

let created = 0;
let updated = 0;

for (const account of authUsers) {
  const profile = profiles.get(account.uid);
  const email = account.email || '';

  if (!profile) {
    created++;
    console.log(`+ create profile   ${email || account.uid}`);
    if (apply) {
      await db.collection('users').doc(account.uid).set({
        email,
        displayName: account.displayName || email.split('@')[0] || 'Unknown User',
        role: 'staff',
        team: '',
        weeklyCapacityHours: DEFAULT_WEEKLY_CAPACITY,
        active: !account.disabled,
        createdAt: Timestamp.fromDate(new Date(account.metadata.creationTime)),
        lastLogin: account.metadata.lastSignInTime ? Timestamp.fromDate(new Date(account.metadata.lastSignInTime)) : null
      });
    }
    continue;
  }

  const fixes = {};
  if (!profile.role || profile.role === 'customer') fixes.role = 'staff';
  if (!profile.email && email) fixes.email = email;
  if (!profile.displayName) fixes.displayName = account.displayName || email.split('@')[0] || 'Unknown User';
  if (profile.active === undefined) fixes.active = !account.disabled;
  if (profile.weeklyCapacityHours === undefined) fixes.weeklyCapacityHours = DEFAULT_WEEKLY_CAPACITY;
  if (profile.team === undefined) fixes.team = '';
  if (!profile.createdAt) fixes.createdAt = Timestamp.fromDate(new Date(account.metadata.creationTime));

  if (Object.keys(fixes).length > 0) {
    updated++;
    console.log(`~ update profile   ${email || account.uid}: ${Object.keys(fixes).join(', ')}`);
    if (apply) await db.collection('users').doc(account.uid).set({ ...fixes, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

const orphans = [...profiles.keys()].filter(id => !authUsers.some(a => a.uid === id));
for (const id of orphans) console.log(`! profile without a login (left unchanged): ${id}`);

console.log(
  `\n[${projectId}] ${authUsers.length} accounts · ${created} to create · ${updated} to update · ${orphans.length} profiles without a login`
);
if (!apply && created + updated > 0) console.log('Preview only. Run with -- --apply to write the changes.');
