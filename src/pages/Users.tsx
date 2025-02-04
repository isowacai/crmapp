import React, { useState, memo, useEffect } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import { User, UserRole } from '../types';
import { Users as UsersIcon, UserPlus, Eye, Pencil, Trash2, X, Shield } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { COLLECTIONS } from '../lib/firebase';

// ... (keep all the existing interfaces and form components)

const Users = () => {
  const { user: currentUser, signUp, updateUserRole } = useAuth();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: users, loading, error: fetchError, update, remove } = useFirestore<User>({
    collectionName: COLLECTIONS.USERS
  });

  // Redirect non-admin users
  if (!currentUser || currentUser.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const handleAdd = () => {
    setIsAddOpen(true);
  };

  const handleView = (user: User) => {
    setSelectedUser(user);
    setIsViewOpen(true);
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsEditOpen(true);
  };

  const handleDelete = (user: User) => {
    setSelectedUser(user);
    setIsDeleteConfirmOpen(true);
  };

  const handleSubmit = async (formData: UserFormData) => {
    try {
      setError(null);
      
      if (isAddOpen) {
        await signUp(formData.email, formData.password, formData.displayName, formData.role);
        setIsAddOpen(false);
      } else if (isEditOpen && selectedUser) {
        await updateUserRole(selectedUser.id, formData.role);
        await update(selectedUser.id, {
          displayName: formData.displayName,
          email: formData.email,
          role: formData.role
        });
        setIsEditOpen(false);
      }
      setSelectedUser(null);
    } catch (error) {
      console.error('Error handling user:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedUser) {
      try {
        setError(null);
        await remove(selectedUser.id);
        setIsDeleteConfirmOpen(false);
        setSelectedUser(null);
      } catch (error) {
        console.error('Error deleting user:', error);
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
          Error loading users: {fetchError.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-xl">
            <UsersIcon className="text-blue-600" size={24} />
          </div>
          <h1 className="text-3xl font-bold">Users</h1>
        </div>
        <button
          onClick={handleAdd}
          className="btn-primary flex items-center gap-2"
        >
          <UserPlus size={20} />
          Add User
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600">
          {error}
        </div>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium">{user.displayName}</div>
                      <div className="text-sm text-gray-600">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                      user.role === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : user.role === 'manager'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      <Shield size={12} />
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      user.active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {user.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(user.lastLogin).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => handleView(user)}
                      className="btn-icon text-blue-600 hover:bg-blue-50"
                      title="View details"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={() => handleEdit(user)}
                      className="btn-icon text-amber-600 hover:bg-amber-50"
                      title="Edit user"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(user)}
                      className="btn-icon text-red-600 hover:bg-red-50"
                      title="Delete user"
                      disabled={user.id === currentUser.id}
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Keep all the existing modals */}
      
    </div>
  );
};

export default Users;