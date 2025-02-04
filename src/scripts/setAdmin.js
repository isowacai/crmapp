import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBzdQE_-COOYXUx8hHn4j0Ew1nOR1uODz8",
  authDomain: "mycrmapp-38a5d.firebaseapp.com",
  projectId: "mycrmapp-38a5d",
  storageBucket: "mycrmapp-38a5d.firebasestorage.app",
  messagingSenderId: "211469404913",
  appId: "1:211469404913:web:4128392d6c164394f8b750"
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