import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Values come from dev.properties (see vite.config.ts)
const firebaseConfig = __FIREBASE_CONFIG__;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Collection references
export const COLLECTIONS = {
  USERS: 'users',
  CATEGORIES: 'categories',
  SERVICES: 'services',
  REQUESTS: 'requests',
  TEAMS: 'teams'
} as const;
