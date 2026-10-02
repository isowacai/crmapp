// Read-only: saves every app collection to backups/<project>-<timestamp>.json (git-ignored).
//   npm run backup-data
import { mkdirSync, writeFileSync } from 'node:fs';
import { db, projectId } from '../config/firebaseAdmin.js';

const COLLECTIONS = ['users', 'teams', 'services', 'categories', 'requests', 'counters'];

const toJson = value =>
  value && typeof value.toDate === 'function'
    ? { __timestamp: value.toDate().toISOString() }
    : Array.isArray(value)
    ? value.map(toJson)
    : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]))
    : value;

const data = {};
for (const name of COLLECTIONS) {
  const snap = await db.collection(name).get();
  data[name] = snap.docs.map(d => ({ id: d.id, ...toJson(d.data()) }));
}

mkdirSync('backups', { recursive: true });
const file = `backups/${projectId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(data, null, 2));
console.log(`[${projectId}] Saved ${COLLECTIONS.map(c => `${data[c].length} ${c}`).join(', ')} to ${file}`);
process.exit(0);
