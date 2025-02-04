import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Timestamp, getDocs, query, doc, setDoc } from 'firebase/firestore';

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

const createSampleData = () => ({
  users: [
    {
      email: 'admin@example.com',
      displayName: 'Admin User',
      role: 'admin',
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now(),
      active: true
    },
    {
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
    },
    {
      name: 'Michael Brown',
      email: 'michael@example.com',
      phone: '(555) 456-7890',
      company: 'Old Corp',
      status: 'inactive',
      lastContact: '2024-01-15',
      createdAt: Timestamp.now()
    }
  ],
  products: [
    {
      name: 'Premium Software License',
      price: 299.99,
      category: 'Software',
      stock: 50,
      description: 'Enterprise-grade software solution with advanced features',
      createdAt: Timestamp.now()
    },
    {
      name: 'Cloud Storage Plan',
      price: 99.99,
      category: 'Services',
      stock: 100,
      description: '1TB cloud storage subscription with backup features',
      createdAt: Timestamp.now()
    },
    {
      name: 'Security Suite',
      price: 199.99,
      category: 'Software',
      stock: 75,
      description: 'Comprehensive security solution for businesses',
      createdAt: Timestamp.now()
    }
  ],
  tasks: [
    {
      title: 'Follow up with Tech Corp',
      description: 'Schedule demo for new software package and discuss implementation timeline',
      status: 'pending',
      dueDate: '2024-03-15',
      assignedTo: 'John Doe',
      priority: 'high',
      createdAt: Timestamp.now()
    },
    {
      title: 'Update product catalog',
      description: 'Add new cloud services and update pricing for Q2',
      status: 'in-progress',
      dueDate: '2024-03-20',
      assignedTo: 'Jane Smith',
      priority: 'medium',
      createdAt: Timestamp.now()
    },
    {
      title: 'Client presentation',
      description: 'Prepare slides for the quarterly review meeting with Design Co',
      status: 'completed',
      dueDate: '2024-03-12',
      assignedTo: 'Mike Johnson',
      priority: 'high',
      createdAt: Timestamp.now()
    }
  ]
});

const checkIfDataExists = async (collectionName: string): Promise<boolean> => {
  const q = query(collection(db, collectionName));
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

const loadCollectionData = async (collectionName: string, data: any[]) => {
  console.log(`Loading ${collectionName}...`);
  
  try {
    const dataExists = await checkIfDataExists(collectionName);
    
    if (dataExists) {
      console.log(`${collectionName} collection already has data, skipping...`);
      return;
    }

    const collectionRef = collection(db, collectionName);
    
    for (const item of data) {
      if (collectionName === 'users') {
        // For users, use email as the document ID
        const docRef = doc(db, collectionName, item.email);
        await setDoc(docRef, item);
      } else {
        await addDoc(collectionRef, item);
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
    
    // Load all collections
    await Promise.all([
      loadCollectionData('users', sampleData.users),
      loadCollectionData('customers', sampleData.customers),
      loadCollectionData('products', sampleData.products),
      loadCollectionData('tasks', sampleData.tasks)
    ]);

    console.log('All data loaded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error loading data:', error);
    process.exit(1);
  }
};

loadInitialData();