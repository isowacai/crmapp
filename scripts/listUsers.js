// Prints every user profile with role, team, and weekly capacity.
import { db, projectId } from '../config/firebaseAdmin.js';

const snapshot = await db.collection('users').get();

if (snapshot.empty) {
  console.log(`[${projectId}] No users found`);
  process.exit(0);
}

console.log(`\n[${projectId}] Users`);
console.log('─'.repeat(118));
console.log('ID'.padEnd(30), '│', 'Name'.padEnd(20), '│', 'Email'.padEnd(28), '│', 'Role'.padEnd(8), '│', 'Team'.padEnd(12), '│', 'Status');
console.log('─'.repeat(118));

for (const doc of snapshot.docs) {
  const user = doc.data();
  const role = !user.role || user.role === 'customer' ? 'staff' : user.role;
  console.log(
    doc.id.padEnd(30), '│',
    String(user.displayName || 'N/A').padEnd(20), '│',
    String(user.email || 'N/A').padEnd(28), '│',
    role.padEnd(8), '│',
    String(user.team || '—').padEnd(12), '│',
    user.active === false ? 'Inactive' : 'Active'
  );
}

console.log('─'.repeat(118));
console.log(`Total users: ${snapshot.size}`);
