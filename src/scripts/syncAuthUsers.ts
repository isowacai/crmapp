import { initializeApp } from 'firebase/app';
import { getFirestore, setDoc, collection, getDocs } from 'firebase/firestore';

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
const db = getFirestore(app);

const syncUsers = async () => {
  try {
    console.log('Starting user synchronization...');
    
    // Get all users from Firestore authentication collection
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    let updated = 0;
    let skipped = 0;

    // Process each user
    for (const doc of snapshot.docs) {
      const userData = doc.data();
      const userRef = doc.ref;

      // Update user data
      const updatedData = {
        email: userData.email,
        displayName: userData.displayName || userData.email?.split('@')[0] || 'Unknown User',
        lastLogin: userData.lastLogin || new Date(),
        createdAt: userData.createdAt || new Date(),
        active: userData.active ?? true,
        role: userData.role || 'customer',
        updatedAt: new Date()
      };

      // Check if update is needed
      const needsUpdate = Object.entries(updatedData).some(
        ([key, value]) => userData[key] !== value
      );

      if (needsUpdate) {
        await setDoc(userRef, updatedData, { merge: true });
        updated++;
        console.log(`Updated user document for ${userData.email}`);
      } else {
        skipped++;
      }
    }

    console.log('\nSynchronization completed:');
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Total processed: ${snapshot.size}`);

    process.exit(0);
  } catch (error) {
    console.error('Error synchronizing users:', error);
    process.exit(1);
  }
};

// Run the sync
syncUsers();