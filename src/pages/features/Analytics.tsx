import { BarChart3, TrendingUp, PieChart, LineChart } from 'lucide-react';
import FeatureHeader from '../../components/FeatureHeader';
import FeatureFooter from '../../components/FeatureFooter';

const Analytics = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <FeatureHeader
        icon={BarChart3}
        title="Advanced Analytics"
        description="Make data-driven decisions with powerful analytics tools"
      />

      {/* Feature Highlights */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Real-time Dashboard</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Monitor your business metrics in real-time with interactive dashboards.
            </p>
            <img
              src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=2000"
              alt="Analytics Dashboard"
              className="rounded-lg shadow-lg w-full"
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <PieChart className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Sales Analytics</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Track sales performance and identify growth opportunities.
            </p>
            <img
              src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2000"
              alt="Sales Analytics"
              className="rounded-lg shadow-lg w-full"
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <LineChart className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Custom Reports</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Generate detailed reports with customizable metrics and visualizations.
            </p>
            <img
              src="https://images.unsplash.com/photo-1543286386-2e659306cd6c?auto=format&fit=crop&q=80&w=2000"
              alt="Custom Reports"
              className="rounded-lg shadow-lg w-full"
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Performance Metrics</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Analyze key performance indicators and business metrics.
            </p>
            <img
              src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=2000"
              alt="Performance Metrics"
              className="rounded-lg shadow-lg w-full"
            />
          </div>
        </div>
      </div>

      <FeatureFooter />
    </div>
  );
};

export default Analytics;