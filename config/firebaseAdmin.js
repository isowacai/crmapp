// Firebase Admin SDK for the Node admin scripts in scripts/. The Admin SDK bypasses Firestore security
// rules, so these scripts keep working once rules are deployed.
//
// Needs a service-account key (Firebase console → Project settings → Service accounts →
// Generate new private key). Save it at config/serviceAccountKey.json (git-ignored), or point
// `firebase.serviceAccountPath` in dev.properties at it. Never commit this file.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { firebaseConfig, readProperty } from './firebaseConfig.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const keyPath = resolve(projectRoot, readProperty('firebase.serviceAccountPath') || 'config/serviceAccountKey.json');

// Against the local emulator (FIRESTORE_EMULATOR_HOST set) no key is needed; used to test scripts
const useEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

if (!useEmulator && !existsSync(keyPath)) {
  console.error(
    `Missing service-account key at ${keyPath}.\n` +
      'Download one from Firebase console → Project settings → Service accounts → Generate new private key,\n' +
      'and save it there (the file is git-ignored). Never commit it.'
  );
  process.exit(1);
}

let app;
if (useEmulator) {
  app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-crmapp' });
} else {
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
  if (serviceAccount.project_id !== firebaseConfig.projectId) {
    console.error(
      `The service-account key is for project "${serviceAccount.project_id}", ` +
        `but dev.properties points at "${firebaseConfig.projectId}". Refusing to continue.`
    );
    process.exit(1);
  }
  app = initializeApp({ credential: cert(serviceAccount), projectId: firebaseConfig.projectId });
}

export const db = getFirestore(app);
export const auth = getAuth(app);
export const projectId = useEmulator ? `${app.options.projectId} (emulator)` : firebaseConfig.projectId;
