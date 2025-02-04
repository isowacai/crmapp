export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  status: 'active' | 'inactive';
  lastContact: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  description: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  dueDate: string;
  assignedTo: string;
  priority: 'low' | 'medium' | 'high';
}

export type UserRole = 'admin' | 'manager' | 'customer';

export interface User {
  id: string;
  email: string | null;
  displayName: string;
  role: UserRole;
  lastLogin: Date;
  createdAt: Date;
  active: boolean;
}