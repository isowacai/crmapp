import { initializeApp } from 'firebase/app';
import { getFirestore, collection, orderBy, QueryConstraint } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDLsYwszyP4JOt4_SsaopAr9ZpTUsYB7Ek",
  authDomain: "mycrmapp-32ca1.firebaseapp.com",
  projectId: "mycrmapp-32ca1",
  storageBucket: "mycrmapp-32ca1.firebasestorage.app",
  messagingSenderId: "1019191724276",
  appId: "1:1019191724276:web:cb11ede35271e7584df6a1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Collection references
export const COLLECTIONS = {
  USERS: 'users',
  CUSTOMERS: 'customers',
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  ORDERS: 'orders',
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