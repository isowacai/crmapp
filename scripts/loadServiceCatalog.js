// Loads a starter service catalog. Only adds categories and services whose names don't exist yet,
// so it is safe to run more than once. Edit the lists below to suit your organisation.
import { Timestamp } from 'firebase-admin/firestore';
import { db, projectId } from '../config/firebaseAdmin.js';
import { slugify } from './migrations/teamsAndPipeline.js';

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

const existingNames = async collection => new Set((await db.collection(collection).get()).docs.map(d => d.get('name')));

// Each service belongs to the team that delivers it; create any team that doesn't exist yet
const teams = new Map((await db.collection('teams').get()).docs.map(d => [String(d.get('name')).toLowerCase(), d.id]));
let addedTeams = 0;
for (const name of new Set(services.map(s => s.ownerTeam))) {
  if (teams.has(name.toLowerCase())) continue;
  let id = slugify(name);
  for (let i = 2; [...teams.values()].includes(id); i++) id = `${slugify(name)}-${i}`;
  await db.collection('teams').doc(id).set({ name, description: '', managerIds: [], createdAt: Timestamp.now() });
  teams.set(name.toLowerCase(), id);
  addedTeams++;
}

const existingCategories = await existingNames('categories');
const existingServices = await existingNames('services');

let addedCategories = 0;
for (const name of categories) {
  if (existingCategories.has(name)) continue;
  await db.collection('categories').add({ name, createdAt: Timestamp.now() });
  addedCategories++;
}

let addedServices = 0;
for (const service of services) {
  if (existingServices.has(service.name)) continue;
  await db.collection('services').add({
    ...service,
    teamId: teams.get(service.ownerTeam.toLowerCase()),
    active: true,
    createdAt: Timestamp.now()
  });
  addedServices++;
}

console.log(`[${projectId}] Added ${addedTeams} teams, ${addedCategories} categories, and ${addedServices} services.`);
