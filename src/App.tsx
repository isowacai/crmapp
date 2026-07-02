import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Orders from './pages/Orders';
import Tasks from './pages/Tasks';
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
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <div className="flex min-h-screen bg-gray-100">
                    <Sidebar />
                    <main className="flex-1">
                      <Dashboard />
                    </main>
                  </div>
                </PrivateRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <PrivateRoute>
                  <div className="flex min-h-screen bg-gray-100">
                    <Sidebar />
                    <main className="flex-1">
                      <Customers />
                    </main>
                  </div>
                </PrivateRoute>
              }
            />
            <Route
              path="/products"
              element={
                <PrivateRoute>
                  <div className="flex min-h-screen bg-gray-100">
                    <Sidebar />
                    <main className="flex-1">
                      <Products />
                    </main>
                  </div>
                </PrivateRoute>
              }
            />
            <Route
              path="/categories"
              element={
                <PrivateRoute>
                  <div className="flex min-h-screen bg-gray-100">
                    <Sidebar />
                    <main className="flex-1">
                      <Categories />
                    </main>
                  </div>
                </PrivateRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <PrivateRoute>
                  <div className="flex min-h-screen bg-gray-100">
                    <Sidebar />
                    <main className="flex-1">
                      <Orders />
                    </main>
                  </div>
                </PrivateRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <PrivateRoute>
                  <div className="flex min-h-screen bg-gray-100">
                    <Sidebar />
                    <main className="flex-1">
                      <Tasks />
                    </main>
                  </div>
                </PrivateRoute>
              }
            />
            <Route
              path="/users"
              element={
                <PrivateRoute>
                  <div className="flex min-h-screen bg-gray-100">
                    <Sidebar />
                    <main className="flex-1">
                      <Users />
                    </main>
                  </div>
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <div className="flex min-h-screen bg-gray-100">
                    <Sidebar />
                    <main className="flex-1">
                      <Profile />
                    </main>
                  </div>
                </PrivateRoute>
              }
            />

            {/* Catch-all route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </FirestoreProvider>
    </AuthProvider>
  );
}

export default App;