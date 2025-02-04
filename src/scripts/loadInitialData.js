import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Timestamp, getDocs, query, doc, setDoc, connectFirestoreEmulator } from 'firebase/firestore';

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

// Sample data creation function
const createSampleData = () => ({
  users: [
    {
      id: 'admin@example.com',  // Use email as ID for easier auth integration
      email: 'admin@example.com',
      displayName: 'Admin User',
      role: 'admin',
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now(),
      active: true
    },
    {
      id: 'manager@example.com',
      email: 'manager@example.com',
      displayName: 'Manager User',
      role: 'manager',
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now(),
      active: true
    }
  ],
  customers: [
    {
      name: 'John Smith',
      email: 'john@example.com',
      phone: '(555) 123-4567',
      company: 'Tech Corp',
      status: 'active',
      lastContact: '2024-03-10',
      createdAt: Timestamp.now()
    },
    {
      name: 'Sarah Johnson',
      email: 'sarah@example.com',
      phone: '(555) 987-6543',
      company: 'Design Co',
      status: 'active',
      lastContact: '2024-03-08',
      createdAt: Timestamp.now()
    }
  ],
  products: [
    {
      name: 'Premium Software License',
      price: 299.99,
      category: 'Software',
      stock: 50,
      description: 'Enterprise-grade software solution',
      createdAt: Timestamp.now()
    },
    {
      name: 'Cloud Storage Plan',
      price: 99.99,
      category: 'Services',
      stock: 100,
      description: '1TB cloud storage subscription',
      createdAt: Timestamp.now()
    }
  ],
  tasks: [
    {
      title: 'Follow up with Tech Corp',
      description: 'Schedule demo for new software',
      status: 'pending',
      dueDate: '2024-03-15',
      assignedTo: 'John Doe',
      priority: 'high',
      createdAt: Timestamp.now()
    },
    {
      title: 'Update product catalog',
      description: 'Add new cloud services',
      status: 'in-progress',
      dueDate: '2024-03-20',
      assignedTo: 'Jane Smith',
      priority: 'medium',
      createdAt: Timestamp.now()
    }
  ]
});

const checkIfDataExists = async (collectionName) => {
  try {
    const q = query(collection(db, collectionName));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error(`Error checking ${collectionName}:`, error);
    return false;
  }
};

const loadCollectionData = async (collectionName, data) => {
  console.log(`Loading ${collectionName}...`);
  
  try {
    const dataExists = await checkIfDataExists(collectionName);
    
    if (dataExists) {
      console.log(`${collectionName} collection already has data, skipping...`);
      return;
    }

    for (const item of data) {
      if (collectionName === 'users') {
        // For users, use email as document ID
        await setDoc(doc(db, collectionName, item.id), item);
      } else {
        await addDoc(collection(db, collectionName), item);
      }
      console.log(`Added document to ${collectionName}`);
    }
    
    console.log(`${collectionName} loaded successfully`);
  } catch (error) {
    console.error(`Error loading ${collectionName}:`, error);
    throw error;
  }
};

const loadInitialData = async () => {
  try {
    console.log('Starting data load...');
    const sampleData = createSampleData();
    
    // Load collections sequentially
    await loadCollectionData('users', sampleData.users);
    await loadCollectionData('customers', sampleData.customers);
    await loadCollectionData('products', sampleData.products);
    await loadCollectionData('tasks', sampleData.tasks);

    console.log('All data loaded successfully!');
    return true;
  } catch (error) {
    console.error('Error loading data:', error);
    throw error;
  }
};

// Execute and handle completion
loadInitialData()
  .then(() => {
    console.log('Data loading completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to load data:', error);
    process.exit(1);
  });