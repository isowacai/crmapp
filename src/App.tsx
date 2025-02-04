import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Products from './pages/Products';
import Tasks from './pages/Tasks';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Login from './pages/Login';
import { FirestoreProvider } from './contexts/FirestoreContext';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';

function App() {
  return (
    <AuthProvider>
      <FirestoreProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </FirestoreProvider>
    </AuthProvider>
  );
}

export default App;