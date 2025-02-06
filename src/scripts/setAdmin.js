import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDLsYwszyP4JOt4_SsaopAr9ZpTUsYB7Ek",
  authDomain: "mycrmapp-32ca1.firebaseapp.com",
  projectId: "mycrmapp-32ca1",
  storageBucket: "mycrmapp-32ca1.firebasestorage.app",
  messagingSenderId: "1019191724276",
  appId: "1:1019191724276:web:cb11ede35271e7584df6a1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const setUserAsAdmin = async (userId) => {
  if (!userId) {
    console.error('Please provide a user ID');
    console.log('Usage: npm run set-admin <userId>');
    process.exit(1);
  }

  try {
    const userRef = doc(db, 'users', userId);
    
    await setDoc(userRef, {
      role: 'admin',
      updatedAt: new Date()
    }, { merge: true });

    console.log(`Successfully set user ${userId} as admin`);
    
    // Force exit since Firebase keeps the connection open
    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    console.error('Error setting admin role:', error);
    process.exit(1);
  }
};

// Get userId from command line argument
const userId = process.argv[2];
setUserAsAdmin(userId);