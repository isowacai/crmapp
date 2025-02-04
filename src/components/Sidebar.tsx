import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Package, CheckSquare, LogOut, User, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  
  const links = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/customers', icon: Users, label: 'Customers' },
    { to: '/products', icon: Package, label: 'Products' },
    { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
    // Only show Users link to admins
    ...(user?.role === 'admin' ? [{ to: '/users', icon: Shield, label: 'Users' }] : []),
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="bg-gray-900 text-white w-64 min-h-screen p-6 flex flex-col">
      <div className="text-xl font-bold mb-10 pl-2 flex items-center gap-2 whitespace-nowrap">
        <Package className="text-blue-500 shrink-0" size={24} />
        <span>Idyle Bella Shop</span>
      </div>

      {user && (
        <Link
          to="/profile"
          className="mb-8 p-4 bg-gray-800 rounded-lg flex items-center gap-3 hover:bg-gray-700 transition-colors"
        >
          <div className="p-2 bg-gray-700 rounded-full">
            <User size={20} className="text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{user.displayName}</p>
            <p className="text-sm text-gray-400 truncate">{user.email}</p>
          </div>
        </Link>
      )}

      <nav className="space-y-2 flex-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.to;
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`flex items-center space-x-3 p-3 rounded-xl ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              } transition-all duration-200`}
            >
              <Icon size={20} />
              <span className="font-medium">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <button
        onClick={handleSignOut}
        className="flex items-center space-x-3 p-3 text-gray-400 hover:bg-gray-800 hover:text-white rounded-xl transition-all duration-200 mt-4"
      >
        <LogOut size={20} />
        <span className="font-medium">Sign Out</span>
      </button>
    </div>
  );
};

export default Sidebar;