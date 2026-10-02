import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ServiceCatalog from './pages/ServiceCatalog';
import Requests from './pages/Requests';
import Capacity from './pages/Capacity';
import Categories from './pages/Categories';
import Team from './pages/Team';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Welcome from './pages/Welcome';
import FeaturePage from './pages/features/FeaturePage';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import ErrorBoundary from './components/ErrorBoundary';

// Shared layout for all authenticated pages
function ProtectedLayout() {
  const location = useLocation();
  return (
    <PrivateRoute>
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <main className="flex-1">
          {/* Keyed by path so moving to another page clears an error */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </PrivateRoute>
  );
}

function App() {
  return (
    <AuthProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Welcome />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/login" element={<Login />} />
            <Route path="/features/:slug" element={<FeaturePage />} />

            {/* Protected Routes */}
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/services" element={<ServiceCatalog />} />
              <Route path="/requests" element={<Requests />} />
              <Route path="/capacity" element={<Capacity />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/team" element={<Team />} />
              <Route path="/workspace/*" element={<Navigate to="/team" replace />} />
              <Route path="/users" element={<Users />} />
              <Route path="/profile" element={<Profile />} />
            </Route>

            {/* Catch-all route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
    </AuthProvider>
  );
}

export default App;
