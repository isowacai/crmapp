import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, Timestamp } from 'firebase/firestore';
import { firebaseConfig } from '../../config/firebaseConfig.js';

// Loads a starter service catalog. Only adds categories and services whose names don't exist yet,
// so it is safe to run more than once. Edit the lists below to suit your organisation.

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const categories = ['IT Support', 'Software & Access', 'Data & Reporting', 'Facilities', 'HR & People'];

const services = [
  { name: 'Laptop or equipment request', category: 'IT Support', ownerTeam: 'IT Operations',
    description: 'New or replacement laptop, monitor, dock, or peripherals.' },
  { name: 'Technical issue / troubleshooting', category: 'IT Support', ownerTeam: 'IT Operations',
    description: 'Something is broken or not working as expected.' },
  { name: 'New starter IT setup', category: 'IT Support', ownerTeam: 'IT Operations',
    description: 'Accounts, equipment, and access for a new team member.' },
  { name: 'Application access request', category: 'Software & Access', ownerTeam: 'IT Operations',
    description: 'Access to an existing system, shared drive, or application.' },
  { name: 'New software evaluation', category: 'Software & Access', ownerTeam: 'Engineering',
    description: 'Assess a new tool for security, cost, and fit before purchase.' },
  { name: 'Small enhancement to an internal app', category: 'Software & Access', ownerTeam: 'Engineering',
    description: 'A change or new feature in an internally built application.' },
  { name: 'New report or dashboard', category: 'Data & Reporting', ownerTeam: 'Data & Analytics',
    description: 'Build a new report or dashboard from existing data sources.' },
  { name: 'Data extract', category: 'Data & Reporting', ownerTeam: 'Data & Analytics',
    description: 'A one-off export of data for analysis.' },
  { name: 'Office move or desk setup', category: 'Facilities', ownerTeam: 'Facilities',
    description: 'Move desks, set up a workspace, or rearrange an area.' },
  { name: 'Maintenance request', category: 'Facilities', ownerTeam: 'Facilities',
    description: 'Repairs to lighting, heating, furniture, or the building.' },
  { name: 'Recruitment support', category: 'HR & People', ownerTeam: 'People Team',
    description: 'Help drafting a role, advertising, and running interviews.' },
  { name: 'Training request', category: 'HR & People', ownerTeam: 'People Team',
    description: 'Arrange internal or external training for a person or team.' }
];

const loadServiceCatalog = async () => {
  try {
    const existingCategories = new Set((await getDocs(collection(db, 'categories'))).docs.map(d => d.data().name));
    const existingServices = new Set((await getDocs(collection(db, 'services'))).docs.map(d => d.data().name));

    let addedCategories = 0;
    for (const name of categories) {
      if (existingCategories.has(name)) continue;
      await addDoc(collection(db, 'categories'), { name, createdAt: Timestamp.now() });
      addedCategories++;
    }

    let addedServices = 0;
    for (const service of services) {
      if (existingServices.has(service.name)) continue;
      await addDoc(collection(db, 'services'), { ...service, active: true, createdAt: Timestamp.now() });
      addedServices++;
    }

    console.log(`Added ${addedCategories} categories and ${addedServices} services.`);
    process.exit(0);
  } catch (error) {
    console.error('Error loading service catalog:', error);
    process.exit(1);
  }
};

loadServiceCatalog();
