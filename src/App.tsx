import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ServiceCatalog from './pages/ServiceCatalog';
import Requests from './pages/Requests';
import Capacity from './pages/Capacity';
import Categories from './pages/Categories';
import Workspace from './pages/Workspace';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Welcome from './pages/Welcome';
import Analytics from './pages/features/Analytics';
import CustomerManagement from './pages/features/CustomerManagement';
import OrderProcessing from './pages/features/OrderProcessing';
import TaskManagement from './pages/features/TaskManagement';
import { FirestoreProvider } from './contexts/FirestoreContext';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';

// Shared layout for all authenticated pages
function ProtectedLayout() {
  return (
    <PrivateRoute>
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </PrivateRoute>
  );
}

function App() {
  return (
    <AuthProvider>
      <FirestoreProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Welcome />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/login" element={<Login />} />
            <Route path="/features/analytics" element={<Analytics />} />
            <Route path="/features/customer-management" element={<CustomerManagement />} />
            <Route path="/features/order-processing" element={<OrderProcessing />} />
            <Route path="/features/task-management" element={<TaskManagement />} />

            {/* Protected Routes */}
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/services" element={<ServiceCatalog />} />
              <Route path="/requests" element={<Requests />} />
              <Route path="/capacity" element={<Capacity />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/workspace" element={<Workspace />} />
              <Route path="/users" element={<Users />} />
              <Route path="/profile" element={<Profile />} />
            </Route>

            {/* Catch-all route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </FirestoreProvider>
    </AuthProvider>
  );
}

export default App;
