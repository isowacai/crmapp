import { useNavigate } from 'react-router-dom';
import { Package, BarChart3, Users, ShoppingBag, CheckSquare, Home } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Welcome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const environment = window.APP_CONFIG?.environment ?? 'UNKNOWN';
  const buildVersion = window.APP_CONFIG?.buildVersion ?? 'UNKNOWN';

  // If user is already logged in, redirect to dashboard
  if (user) {
    navigate('/dashboard');
    return null;
  }

  const features = [
    {
      icon: BarChart3,
      title: 'Advanced Analytics',
      description: 'Get detailed insights into your business performance with real-time analytics and reporting.',
      link: '/features/analytics'
    },
    {
      icon: Users,
      title: 'Customer Management',
      description: 'Efficiently manage customer relationships, track interactions, and improve engagement.',
      link: '/features/customer-management'
    },
    {
      icon: ShoppingBag,
      title: 'Order Processing',
      description: 'Streamline your order management process from creation to fulfillment.',
      link: '/features/order-processing'
    },
    {
      icon: CheckSquare,
      title: 'Task Management',
      description: 'Stay organized with built-in task management and team collaboration tools.',
      link: '/features/task-management'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 bg-opacity-10 rounded-xl">
                <Package className="text-blue-400" size={32} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Dukaanley</h1>
                <p className="text-blue-400 text-sm">Business Management</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                <Home size={20} />
                Home
              </button>
              <button
                onClick={() => navigate('/login')}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => navigate('/login?signup=true')}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Streamline Your Business Operations
          </h1>
          <p className="text-xl text-gray-400 mb-12 max-w-3xl mx-auto">
            An all-in-one solution for managing your business. From customer relationships to order processing,
            we've got you covered.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/login?signup=true')}
              className="px-8 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-lg font-medium"
            >
              Get Started Free
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-4 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-lg font-medium"
            >
              Live Demo
            </button>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-4">
            Everything You Need to Succeed
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Our comprehensive suite of tools helps you manage every aspect of your business efficiently.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <button
                key={index}
                onClick={() => navigate(feature.link)}
                className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-blue-500 transition-colors text-left"
              >
                <div className="p-3 bg-blue-500 bg-opacity-10 rounded-xl w-fit mb-4">
                  <Icon className="text-blue-400" size={24} />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-400">
                  {feature.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* CTA Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-12 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Transform Your Business?
          </h2>
          <p className="text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of businesses already using our platform to grow and succeed.
            Get started today with our free trial.
          </p>
          <button
            onClick={() => navigate('/login?signup=true')}
            className="px-8 py-4 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-lg font-medium"
          >
            Start Free Trial
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 bg-opacity-10 rounded-xl">
                <Package className="text-blue-400" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Dukaan</h2>
                <p className="text-blue-400 text-sm">© 2025 All rights reserved</p>
                <p className="text-gray-400 text-xs mt-1">
                Environment: {environment} | Build: {buildVersion}
                </p>
              </div>
            </div>
            <div className="flex gap-8 text-gray-400">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Welcome;
