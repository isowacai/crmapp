import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC0Jr9IlurH1-AfStLVaDFMv81IJTh2Btw",
  authDomain: "crmboltapp.firebaseapp.com",
  projectId: "crmboltapp",
  storageBucket: "crmboltapp.appspot.com",
  messagingSenderId: "596047524575",
  appId: "1:596047524575:web:6830f4b95a42c13523ef6a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function setUserAsAdmin(userId: string) {
  if (!userId) {
    console.error('Please provide a user ID');
    console.log('Usage: npm run set-admin <userId>');
    process.exit(1);
  }

  try {
    const userRef = doc(db, 'users', userId);
    
    // Update user document
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
}

// Get userId from command line argument
const userId = process.argv[2];
setUserAsAdmin(userId);