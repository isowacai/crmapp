import { Users, UserPlus, MessageSquare, History } from 'lucide-react';
import FeatureHeader from '../../components/FeatureHeader';
import FeatureFooter from '../../components/FeatureFooter';

const CustomerManagement = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <FeatureHeader
        icon={Users}
        title="Customer Management"
        description="Build stronger relationships with your customers"
      />

      {/* Feature Highlights */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <UserPlus className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Customer Profiles</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Maintain detailed customer profiles with all relevant information.
            </p>
            <img
              src="https://images.unsplash.com/photo-1549923746-c502d488b3ea?auto=format&fit=crop&q=80&w=2000"
              alt="Customer Profiles"
              className="rounded-lg shadow-lg w-full"
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <MessageSquare className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Communication History</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Track all customer interactions and communications in one place.
            </p>
            <img
              src="https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&q=80&w=2000"
              alt="Communication History"
              className="rounded-lg shadow-lg w-full"
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <History className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Purchase History</h3>
            </div>
            <p className="text-gray-400 mb-6">
              View complete purchase history and customer preferences.
            </p>
            <img
              src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=2000"
              alt="Purchase History"
              className="rounded-lg shadow-lg w-full"
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Users className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Segmentation</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Segment customers based on behavior and preferences.
            </p>
            <img
              src="https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=2000"
              alt="Customer Segmentation"
              className="rounded-lg shadow-lg w-full"
            />
          </div>
        </div>
      </div>

      <FeatureFooter />
    </div>
  );
};

export default CustomerManagement;