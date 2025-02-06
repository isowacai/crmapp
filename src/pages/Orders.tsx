import React, { useState, memo } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { Order, OrderItem, Product, Customer } from '../types';
import { ShoppingBag, Plus, Eye, Pencil, Trash2, X, Package, ArrowUpDown, Search, Filter } from 'lucide-react';
import { Navigate } from 'react-router-dom';

interface OrderFormData {
  customerId: string;
  customerName: string;
  items: OrderItem[];
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  notes?: string;
}

const initialFormData: OrderFormData = {
  customerId: '',
  customerName: '',
  items: [],
  status: 'pending',
  notes: ''
};

const getLastOrderSequence = async (orders: Order[], datePrefix: string): Promise<number> => {
  try {
    // Filter orders for the given date prefix
    const dayOrders = orders.filter(order => order.id.startsWith(datePrefix));
    
    if (dayOrders.length === 0) return 1; // Start with 1 to get 0001

    // Extract sequence numbers and find the highest
    const sequences = dayOrders.map(order => {
      const sequence = parseInt(order.id.split('-')[1]);
      return isNaN(sequence) ? 0 : sequence;
    });

    return Math.max(...sequences) + 1; // Return next sequence number
  } catch (error) {
    console.error('Error getting last order sequence:', error);
    throw new Error('Failed to generate order sequence');
  }
};

const generateOrderId = async (orders: Order[]): Promise<string> => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;
    
    // Get the next sequence number for today
    const nextSequence = await getLastOrderSequence(orders, datePrefix);
    
    // Pad sequence with zeros to always be 4 digits
    const sequence = String(nextSequence).padStart(4, '0');
    
    return `${datePrefix}-${sequence}`;
  } catch (error) {
    console.error('Error generating order ID:', error);
    throw new Error('Failed to generate order ID');
  }
};

const OrderForm = memo(({
  onSubmit,
  onCancel,
  initialData = initialFormData,
  isAdd = true,
  products,
  customers
}: {
  onSubmit: (data: OrderFormData) => void;
  onCancel: () => void;
  initialData?: OrderFormData;
  isAdd?: boolean;
  products: Product[];
  customers: Customer[];
}) => {
  const [formData, setFormData] = useState<OrderFormData>(initialData);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      setFormData(prev => ({
        ...prev,
        customerId,
        customerName: customer.name
      }));
    }
  };

  const handleAddItem = () => {
    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    const newItem: OrderItem = {
      productId: product.id,
      productName: product.name,
      quantity,
      price: product.price
    };

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));

    setSelectedProduct('');
    setQuantity(1);
  };

  const handleRemoveItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700">Customer</label>
        <select
          value={formData.customerId}
          onChange={(e) => handleCustomerChange(e.target.value)}
          className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        >
          <option value="">Select a customer</option>
          {customers.map(customer => (
            <option key={customer.id} value={customer.id}>
              {customer.name} - {customer.company}
            </option>
          ))}
        </select>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-lg font-medium mb-4">Order Items</h3>
        
        <div className="flex gap-4 mb-4">
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Select a product</option>
            {products.map(product => (
              <option key={product.id} value={product.id}>
                {product.name} - ${product.price}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            className="w-24 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleAddItem}
            disabled={!selectedProduct}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>

        <div className="space-y-2">
          {formData.items.map((item, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium">{item.productName}</div>
                <div className="text-sm text-gray-600">
                  {item.quantity} x ${item.price} = ${(item.quantity * item.price).toFixed(2)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveItem(index)}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 text-right">
          <div className="text-lg font-bold">
            Total: ${calculateTotal().toFixed(2)}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Status</label>
        <select
          value={formData.status}
          onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as Order['status'] }))}
          className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          rows={3}
          className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          {isAdd ? 'Create Order' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
});

OrderForm.displayName = 'OrderForm';

const Orders = () => {
  const { user } = useAuth();
  
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return <Navigate to="/" replace />;
  }

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof Order>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<Order['status'] | 'all'>('all');

  const { data: orders, loading, error: fetchError, add, update, remove } = useFirestore<Order>({
    collectionName: COLLECTIONS.ORDERS
  });

  const { data: products } = useFirestore<Product>({
    collectionName: COLLECTIONS.PRODUCTS
  });

  const { data: customers } = useFirestore<Customer>({
    collectionName: COLLECTIONS.CUSTOMERS
  });

  // Filter orders based on search term and status
  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Sort filtered orders
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    let comparison = 0;
    
    if (sortField === 'totalAmount') {
      comparison = a.totalAmount - b.totalAmount;
    } else if (sortField === 'createdAt') {
      comparison = (a.createdAt as any).seconds - (b.createdAt as any).seconds;
    } else {
      comparison = String(a[sortField]).localeCompare(String(b[sortField]));
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleAdd = () => {
    setIsAddOpen(true);
  };

  const handleView = (order: Order) => {
    setSelectedOrder(order);
    setIsViewOpen(true);
  };

  const handleEdit = (order: Order) => {
    setSelectedOrder(order);
    setIsEditOpen(true);
  };

  const handleDelete = (order: Order) => {
    setSelectedOrder(order);
    setIsDeleteConfirmOpen(true);
  };

  const handleSort = (field: keyof Order) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSubmit = async (formData: OrderFormData) => {
    try {
      setError(null);
      
      const orderData = {
        ...formData,
        totalAmount: formData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        createdBy: user.id,
        updatedAt: new Date()
      };

      if (isAddOpen) {
        try {
          const orderId = await generateOrderId(orders);
          await add({ 
            ...orderData, 
            id: orderId,
            createdAt: new Date() 
          });
          setIsAddOpen(false);
        } catch (error) {
          throw new Error('Failed to create order: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
      } else if (isEditOpen && selectedOrder) {
        try {
          await update(selectedOrder.id, orderData);
          setIsEditOpen(false);
        } catch (error) {
          throw new Error('Failed to update order: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
      }
      setSelectedOrder(null);
    } catch (error) {
      console.error('Error handling order:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while processing the order');
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedOrder) {
      try {
        setError(null);
        await remove(selectedOrder.id);
        setIsDeleteConfirmOpen(false);
        setSelectedOrder(null);
      } catch (error) {
        console.error('Error deleting order:', error);
        setError(error instanceof Error ? error.message : 'An error occurred');
      }
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Error loading orders: {fetchError.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
            <ShoppingBag className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Orders</h1>
            <p className="text-gray-500 text-sm">Manage customer orders</p>
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-500/20 font-medium"
        >
          <Plus size={20} />
          New Order
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600 border border-red-200">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter size={20} className="text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as Order['status'] | 'all')}
                className="rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order ID
                </th>
                <th className="px-6 py-4 text-left">
                  <button
                    onClick={() => handleSort('customerName')}
                    className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Customer
                    <ArrowUpDown size={14} />
                  </button>
                </th>
                <th className="px-6 py-4 text-left">
                  <button
                    onClick={() => handleSort('status')}
                    className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                    <ArrowUpDown size={14} />
                  </button>
                </th>
                <th className="px-6 py-4 text-left">
                  <button
                    onClick={() => handleSort('totalAmount')}
                    className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Total
                    <ArrowUpDown size={14} />
                  </button>
                </th>
                <th className="px-6 py-4 text-left">
                  <button
                    onClick={() => handleSort('createdAt')}
                    className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Created At
                    <ArrowUpDown size={14} />
                  </button>
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-gray-600">#{order.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{order.customerName}</div>
                    <div className="text-sm text-gray-600">{order.items.length} items</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      order.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : order.status === 'processing'
                        ? 'bg-blue-100 text-blue-800'
                        : order.status === 'cancelled'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-blue-600">
                      ${order.totalAmount.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {order.createdAt instanceof Date 
                      ? order.createdAt.toLocaleDateString()
                      : new Date(order.createdAt.seconds * 1000).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleView(order)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View details"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => handleEdit(order)}
                        className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Edit order"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(order)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete order"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(isAddOpen || isEditOpen) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {isAddOpen ? 'New Order' : 'Edit Order'}
              </h2>
              <button
                onClick={() => {
                  setIsAddOpen(false);
                  setIsEditOpen(false);
                  setError(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <OrderForm
              onSubmit={handleSubmit}
              onCancel={() => {
                setIsAddOpen(false);
                setIsEditOpen(false);
                setError(null);
              }}
              initialData={selectedOrder || initialFormData}
              isAdd={isAddOpen}
              products={products}
              customers={customers}
            />
          </div>
        </div>
      )}

      {/* View Modal */}
      {isViewOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold">Order Details</h2>
                <p className="text-sm text-gray-500">Order #{selectedOrder.id}</p>
              </div>
              <button
                onClick={() => {
                  setIsViewOpen(false);
                  setError(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500">Customer</h3>
                <p className="mt-1 text-lg font-medium">{selectedOrder.customerName}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Items</h3>
                <div className="space-y-2">
                  {selectedOrder.items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <Package className="text-blue-600" size={16} />
                        </div>
                        <div>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-sm text-gray-600">
                            {item.quantity} x ${item.price}
                          </div>
                        </div>
                      </div>
                      <div className="font-medium">
                        ${(item.quantity * item.price).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-right">
                  <div className="text-lg font-bold">
                    Total: ${selectedOrder.totalAmount.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Status</h3>
                  <span className={`mt-1 inline-block px-3 py-1 rounded-full text-sm font-medium ${
                    selectedOrder.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedOrder.status === 'processing'
                      ? 'bg-blue-100 text-blue-800'
                      : selectedOrder.status === 'cancelled'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {selectedOrder.status}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">Created At</h3>
                  <p className="mt-1 text-gray-900">
                    {selectedOrder.createdAt instanceof Date 
                      ? selectedOrder.createdAt.toLocaleDateString()
                      : new Date(selectedOrder.createdAt.seconds * 1000).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {selectedOrder.notes && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Notes</h3>
                  <p className="mt-1 text-gray-900">{selectedOrder.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Confirm Delete</h2>
              <button
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setError(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this order from {selectedOrder.customerName}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setError(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;