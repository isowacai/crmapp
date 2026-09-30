import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { firebaseConfig } from '../../config/firebaseConfig.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const listUsers = async () => {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    if (snapshot.empty) {
      console.log('No users found');
      process.exit(0);
    }

    // Print table header
    console.log('\nUser List:');
    console.log('─'.repeat(100));
    console.log('ID'.padEnd(25), '│', 
                'Name'.padEnd(20), '│',
                'Email'.padEnd(25), '│',
                'Role'.padEnd(10), '│',
                'Status');
    console.log('─'.repeat(100));

    // Print each user
    snapshot.forEach(doc => {
      const user = doc.data();
      console.log(
        doc.id.padEnd(25), '│',
        (user.displayName || 'N/A').padEnd(20), '│',
        (user.email || 'N/A').padEnd(25), '│',
        (user.role || 'staff').padEnd(10), '│',
        user.active ? 'Active' : 'Inactive'
      );
    });

    console.log('─'.repeat(100));
    console.log(`Total users: ${snapshot.size}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error listing users:', error);
    process.exit(1);
  }
};

listUsers();