import { initializeApp } from 'firebase/app';
import { getFirestore, collection, orderBy, QueryConstraint } from 'firebase/firestore';
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
  TASKS: 'tasks'
} as const;

// Helper functions for common queries
export const getCollectionRef = (collectionName: string) => collection(db, collectionName);

export const createQueryConstraints = (collectionName?: string): QueryConstraint[] => {
  const constraints: QueryConstraint[] = [];
  
  // Add collection-specific constraints
  if (collectionName === COLLECTIONS.USERS) {
    // No additional constraints for users collection
    return constraints;
  }
  
  // Add default ordering by createdAt for all other collections
  constraints.push(orderBy('createdAt', 'desc'));
  
  return constraints;
};