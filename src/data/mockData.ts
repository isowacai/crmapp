import { Customer, Product, Task } from '../types';

export const customers: Customer[] = [
  {
    id: '1',
    name: 'John Smith',
    email: 'john@example.com',
    phone: '(555) 123-4567',
    company: 'Tech Corp',
    status: 'active',
    lastContact: '2024-03-10',
  },
  {
    id: '2',
    name: 'Sarah Johnson',
    email: 'sarah@example.com',
    phone: '(555) 987-6543',
    company: 'Design Co',
    status: 'active',
    lastContact: '2024-03-08',
  },
  {
    id: '3',
    name: 'Michael Brown',
    email: 'michael@example.com',
    phone: '(555) 456-7890',
    company: 'Old Corp',
    status: 'inactive',
    lastContact: '2024-01-15',
  },
  {
    id: '4',
    name: 'Emily Davis',
    email: 'emily@example.com',
    phone: '(555) 234-5678',
    company: 'Past LLC',
    status: 'inactive',
    lastContact: '2024-02-01',
  }
];

export const products: Product[] = [
  {
    id: '1',
    name: 'Premium Software License',
    price: 299.99,
    category: 'Software',
    stock: 50,
    description: 'Enterprise-grade software solution',
  },
  {
    id: '2',
    name: 'Cloud Storage Plan',
    price: 99.99,
    category: 'Services',
    stock: 100,
    description: '1TB cloud storage subscription',
  },
];

export const tasks: Task[] = [
  {
    id: '1',
    title: 'Follow up with Tech Corp',
    description: 'Schedule demo for new software',
    status: 'pending',
    dueDate: '2024-03-15',
    assignedTo: 'John Doe',
    priority: 'high',
  },
  {
    id: '2',
    title: 'Update product catalog',
    description: 'Add new cloud services',
    status: 'in-progress',
    dueDate: '2024-03-20',
    assignedTo: 'Jane Smith',
    priority: 'medium',
  },
  {
    id: '3',
    title: 'Client presentation',
    description: 'Prepare slides for the quarterly review',
    status: 'completed',
    dueDate: '2024-03-12',
    assignedTo: 'Mike Johnson',
    priority: 'high',
  }
];