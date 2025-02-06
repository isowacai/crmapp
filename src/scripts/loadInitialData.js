import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Timestamp, getDocs, query, doc, setDoc } from 'firebase/firestore';

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

const createSampleData = () => ({
  users: [
    {
      id: 'admin@example.com',
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
  orders: [
    {
      customerId: '',  // Will be set after customer creation
      customerName: 'John Smith',
      items: [
        {
          productId: '',  // Will be set after product creation
          productName: 'Premium Software License',
          quantity: 2,
          price: 299.99
        }
      ],
      status: 'completed',
      totalAmount: 599.98,
      notes: 'Initial order for software licenses',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: 'admin@example.com'
    },
    {
      customerId: '',  // Will be set after customer creation
      customerName: 'Sarah Johnson',
      items: [
        {
          productId: '',  // Will be set after product creation
          productName: 'Cloud Storage Plan',
          quantity: 1,
          price: 99.99
        }
      ],
      status: 'processing',
      totalAmount: 99.99,
      notes: 'Cloud storage subscription',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: 'manager@example.com'
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
  ],
  categories: [
    {
      name: 'Software',
      createdAt: Timestamp.now()
    },
    {
      name: 'Hardware',
      createdAt: Timestamp.now()
    },
    {
      name: 'Services',
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

    const createdDocs = [];
    for (const item of data) {
      if (collectionName === 'users') {
        await setDoc(doc(db, collectionName, item.id), item);
        createdDocs.push({ id: item.id, ...item });
      } else {
        const docRef = await addDoc(collection(db, collectionName), item);
        createdDocs.push({ id: docRef.id, ...item });
      }
      console.log(`Added document to ${collectionName}`);
    }
    
    console.log(`${collectionName} loaded successfully`);
    return createdDocs;
  } catch (error) {
    console.error(`Error loading ${collectionName}:`, error);
    throw error;
  }
};

const loadInitialData = async () => {
  try {
    console.log('Starting data load...');
    const sampleData = createSampleData();
    
    // Load collections in order to maintain references
    const customers = await loadCollectionData('customers', sampleData.customers);
    const products = await loadCollectionData('products', sampleData.products);
    
    // Update order references
    if (customers && products) {
      sampleData.orders[0].customerId = customers[0].id;
      sampleData.orders[0].items[0].productId = products[0].id;
      
      sampleData.orders[1].customerId = customers[1].id;
      sampleData.orders[1].items[0].productId = products[1].id;
    }
    
    // Load remaining collections
    await loadCollectionData('users', sampleData.users);
    await loadCollectionData('orders', sampleData.orders);
    await loadCollectionData('tasks', sampleData.tasks);
    await loadCollectionData('categories', sampleData.categories);

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