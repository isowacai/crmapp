import { ShoppingBag, Package, Truck, CreditCard } from 'lucide-react';
import FeatureHeader from '../../components/FeatureHeader';
import FeatureFooter from '../../components/FeatureFooter';

const OrderProcessing = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <FeatureHeader
        icon={ShoppingBag}
        title="Order Processing"
        description="Streamline your order management workflow"
      />

      {/* Feature Highlights */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <ShoppingBag className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Order Management</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Efficiently manage and track all orders in one place.
            </p>
            <img
              src="https://images.unsplash.com/photo-1553729459-efe14ef6055d?auto=format&fit=crop&q=80&w=2000"
              alt="Order Management"
              className="rounded-lg shadow-lg w-full"
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Package className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Inventory Tracking</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Real-time inventory management and stock level monitoring.
            </p>
            <img
              src="https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&q=80&w=2000"
              alt="Inventory Tracking"
              className="rounded-lg shadow-lg w-full"
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Truck className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Shipping Management</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Streamline shipping processes and track deliveries.
            </p>
            <img
              src="https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&q=80&w=2000"
              alt="Shipping Management"
              className="rounded-lg shadow-lg w-full"
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <CreditCard className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Payment Processing</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Secure payment processing and transaction management.
            </p>
            <img
              src="https://images.unsplash.com/photo-1556742111-a301076d9d18?auto=format&fit=crop&q=80&w=2000"
              alt="Payment Processing"
              className="rounded-lg shadow-lg w-full"
            />
          </div>
        </div>
      </div>

      <FeatureFooter />
    </div>
  );
};

export default OrderProcessing;