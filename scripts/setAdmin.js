// Gives a user the admin role. Usage: npm run set-admin <userId or email>
import { FieldValue } from 'firebase-admin/firestore';
import { auth, db, projectId } from '../config/firebaseAdmin.js';

const target = process.argv[2];
if (!target) {
  console.error('Usage: npm run set-admin <userId or email>');
  process.exit(1);
}

// Accept an email as well as a user ID
const userId = target.includes('@') ? (await auth.getUserByEmail(target)).uid : target;
const userRef = db.collection('users').doc(userId);
const existing = await userRef.get();

if (!existing.exists) {
  console.error(`[${projectId}] No profile found for ${target}. Ask them to sign in once, or run npm run sync-users.`);
  process.exit(1);
}

await userRef.set({ role: 'admin', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
console.log(`[${projectId}] ${existing.get('displayName') || userId} is now an admin.`);
