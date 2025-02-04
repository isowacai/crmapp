const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBzdQE_-COOYXUx8hHn4j0Ew1nOR1uODz8",
  authDomain: "mycrmapp-38a5d.firebaseapp.com",
  projectId: "mycrmapp-38a5d",
  storageBucket: "mycrmapp-38a5d.firebasestorage.app",
  messagingSenderId: "211469404913",
  appId: "1:211469404913:web:4128392d6c164394f8b750"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function listUsers() {
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
        (user.role || 'customer').padEnd(10), '│',
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
}

listUsers();