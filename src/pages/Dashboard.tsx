import { Users, Package, TrendingUp, Boxes } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { COLLECTIONS } from '../lib/firebase';
import { Customer, Product, Task } from '../types';
import DashboardCard from '../components/DashboardCard';
import PieChart from '../components/PieChart';

const Dashboard = () => {
  const { data: customers, loading: customersLoading } = useFirestore<Customer>({
    collectionName: COLLECTIONS.CUSTOMERS
  });

  const { data: products, loading: productsLoading } = useFirestore<Product>({
    collectionName: COLLECTIONS.PRODUCTS
  });

  const { data: tasks, loading: tasksLoading } = useFirestore<Task>({
    collectionName: COLLECTIONS.TASKS
  });

  if (customersLoading || productsLoading || tasksLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  // Calculate total revenue (price * stock for each product)
  const totalRevenue = products.reduce((sum, product) => sum + (product.price * product.stock), 0);
  
  // Calculate total units in stock
  const totalStock = products.reduce((sum, product) => sum + product.stock, 0);

  const stats = [
    {
      title: 'Total Customers',
      value: customers.length,
      icon: Users,
      color: 'bg-blue-600',
    },
    {
      title: 'Total Products',
      value: products.length,
      icon: Package,
      color: 'bg-emerald-600',
    },
    {
      title: 'Units in Stock',
      value: totalStock,
      icon: Boxes,
      color: 'bg-purple-600',
    },
    {
      title: 'Revenue',
      value: totalRevenue,
      icon: TrendingUp,
      color: 'bg-amber-600',
    },
  ];

  const taskStatusData = [
    { label: 'Pending', value: tasks.filter(t => t.status === 'pending').length, color: '#f59e0b' },
    { label: 'In Progress', value: tasks.filter(t => t.status === 'in-progress').length, color: '#3b82f6' },
    { label: 'Completed', value: tasks.filter(t => t.status === 'completed').length, color: '#10b981' }
  ];

  const customerStatusData = [
    { label: 'Active', value: customers.filter(c => c.status === 'active').length, color: '#10b981' },
    { label: 'Inactive', value: customers.filter(c => c.status === 'inactive').length, color: '#6b7280' }
  ];

  // Sort customers by createdAt timestamp in descending order
  const recentCustomers = [...customers]
    .sort((a: any, b: any) => b.createdAt?.seconds - a.createdAt?.seconds)
    .slice(0, 5);

  // Sort tasks by createdAt timestamp in descending order
  const recentTasks = [...tasks]
    .sort((a: any, b: any) => b.createdAt?.seconds - a.createdAt?.seconds)
    .slice(0, 5);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <DashboardCard key={stat.title} {...stat} />
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="card p-6 flex items-center justify-center">
          <PieChart
            data={taskStatusData}
            size={160}
            title="Task Status Distribution"
          />
        </div>
        <div className="card p-6 flex items-center justify-center">
          <PieChart
            data={customerStatusData}
            size={160}
            title="Customer Status Distribution"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-6">Recent Customers</h2>
          <div className="space-y-4">
            {recentCustomers.map((customer) => (
              <div key={customer.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                <div>
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-gray-600">{customer.company}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  customer.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {customer.status}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-6">Recent Tasks</h2>
          <div className="space-y-4">
            {recentTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-sm text-gray-600">Due: {task.dueDate}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  task.priority === 'high' 
                    ? 'bg-red-100 text-red-800'
                    : task.priority === 'medium'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {task.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;