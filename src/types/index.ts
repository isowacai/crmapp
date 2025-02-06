export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  status: 'active' | 'inactive';
  lastContact: string;
  createdAt: {
    seconds: number;
    nanoseconds: number;
  };
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  description: string;
  createdAt: {
    seconds: number;
    nanoseconds: number;
  };
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  dueDate: string;
  assignedTo: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: {
    seconds: number;
    nanoseconds: number;
  };
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

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
  productName: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  items: OrderItem[];
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  totalAmount: number;
  createdAt: {
    seconds: number;
    nanoseconds: number;
  };
  updatedAt: Date;
  notes?: string;
  createdBy: string;
}