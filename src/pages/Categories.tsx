import React, { useState, memo } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { Tags, Plus, Pencil, Trash2, X } from 'lucide-react';
import { Navigate } from 'react-router-dom';

interface Category {
  id: string;
  name: string;
  createdAt: Date;
}

interface CategoryFormData {
  name: string;
}

const CategoryForm = memo(({
  onSubmit,
  onCancel,
  initialData
}: {
  onSubmit: (data: CategoryFormData) => void;
  onCancel: () => void;
  initialData?: CategoryFormData;
}) => {
  const [formData, setFormData] = useState<CategoryFormData>(initialData || { name: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Category Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ name: e.target.value })}
          className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          {initialData ? 'Save Changes' : 'Add Category'}
        </button>
      </div>
    </form>
  );
});

CategoryForm.displayName = 'CategoryForm';

const Categories = () => {
  const { user } = useAuth();
  
  // Redirect non-admin/non-manager users
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return <Navigate to="/" replace />;
  }

  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: categories, loading, error: fetchError, add, update, remove } = useFirestore<Category>({
    collectionName: COLLECTIONS.CATEGORIES
  });

  const handleAdd = () => {
    setIsAddOpen(true);
  };

  const handleEdit = (category: Category) => {
    setSelectedCategory(category);
    setIsEditOpen(true);
  };

  const handleDelete = (category: Category) => {
    setSelectedCategory(category);
    setIsDeleteConfirmOpen(true);
  };

  const handleSubmit = async (formData: CategoryFormData) => {
    try {
      setError(null);
      
      if (isAddOpen) {
        await add(formData);
        setIsAddOpen(false);
      } else if (isEditOpen && selectedCategory) {
        await update(selectedCategory.id, formData);
        setIsEditOpen(false);
      }
      setSelectedCategory(null);
    } catch (error) {
      console.error('Error handling category:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedCategory) {
      try {
        setError(null);
        await remove(selectedCategory.id);
        setIsDeleteConfirmOpen(false);
        setSelectedCategory(null);
      } catch (error) {
        console.error('Error deleting category:', error);
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
          Error loading categories: {fetchError.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
            <Tags className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Categories</h1>
            <p className="text-gray-500 text-sm">Manage product categories</p>
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-500/20 font-medium"
        >
          <Plus size={20} />
          Add Category
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600 border border-red-200">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created At
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((category) => (
                <tr key={category.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Tags className="text-blue-600" size={16} />
                      </div>
                      <span className="font-medium">{category.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {category.createdAt instanceof Date 
                      ? category.createdAt.toLocaleDateString()
                      : new Date(category.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(category)}
                        className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Edit category"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(category)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete category"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(isAddOpen || isEditOpen) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {isAddOpen ? 'Add Category' : 'Edit Category'}
              </h2>
              <button
                onClick={() => {
                  setIsAddOpen(false);
                  setIsEditOpen(false);
                  setError(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <CategoryForm
              onSubmit={handleSubmit}
              onCancel={() => {
                setIsAddOpen(false);
                setIsEditOpen(false);
                setError(null);
              }}
              initialData={selectedCategory ? { name: selectedCategory.name } : undefined}
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && selectedCategory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Confirm Delete</h2>
              <button
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setError(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete the category "{selectedCategory.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setError(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Categories;