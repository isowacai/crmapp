import React, { useState, memo } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { COLLECTIONS } from '../lib/firebase';
import { Product } from '../types';
import { Package, Plus, Eye, Pencil, Trash2, X, Tags, Check, LayoutGrid, List } from 'lucide-react';

const DEFAULT_CATEGORIES = [
  'Software',
  'Hardware',
  'Services',
  'Cloud Solutions',
  'Security',
  'Networking',
  'Storage',
  'Mobile',
  'IoT',
  'Other'
];

interface ProductFormData {
  name: string;
  price: number;
  category: string;
  stock: number;
  description: string;
}

const initialFormData: ProductFormData = {
  name: '',
  price: 0,
  category: '',
  stock: 0,
  description: ''
};

// Memoized form component
const ProductForm = memo(({
  onSubmit,
  onCancel,
  initialData = initialFormData,
  isAdd = true,
  categories
}: {
  onSubmit: (data: ProductFormData) => void;
  onCancel: () => void;
  initialData?: ProductFormData;
  isAdd?: boolean;
  categories: string[];
}) => {
  const [formData, setFormData] = useState<ProductFormData>(initialData);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = <K extends keyof ProductFormData>(field: K, value: ProductFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={e => handleChange('name', e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Price</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={formData.price}
          onChange={e => handleChange('price', parseFloat(e.target.value) || 0)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Category</label>
        <select
          value={formData.category}
          onChange={e => handleChange('category', e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        >
          <option value="">Select a category</option>
          {categories.map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Stock</label>
        <input
          type="number"
          min="0"
          value={formData.stock}
          onChange={e => handleChange('stock', parseInt(e.target.value) || 0)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={formData.description}
          onChange={e => handleChange('description', e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>
      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary"
        >
          {isAdd ? 'Add Product' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
});

ProductForm.displayName = 'ProductForm';

// Memoized category form component
const CategoryForm = memo(({
  onSubmit,
  categories,
  onDeleteCategory,
  onEditCategory
}: {
  onSubmit: (category: string) => void;
  categories: string[];
  onDeleteCategory: (category: string) => void;
  onEditCategory: (oldCategory: string, newCategory: string) => void;
}) => {
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editedCategoryName, setEditedCategoryName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategory.trim()) {
      onSubmit(newCategory.trim());
      setNewCategory('');
    }
  };

  const handleEdit = (category: string) => {
    setEditingCategory(category);
    setEditedCategoryName(category);
  };

  const handleSave = (oldCategory: string) => {
    if (editedCategoryName.trim() && editedCategoryName !== oldCategory) {
      onEditCategory(oldCategory, editedCategoryName.trim());
    }
    setEditingCategory(null);
    setEditedCategoryName('');
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="New category name"
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="btn-primary"
          >
            Add
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {categories.map((category) => (
          <div
            key={category}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {editingCategory === category ? (
              <div className="flex-1 flex items-center gap-2 pr-2">
                <input
                  type="text"
                  value={editedCategoryName}
                  onChange={(e) => setEditedCategoryName(e.target.value)}
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  autoFocus
                />
                <button
                  onClick={() => handleSave(category)}
                  className="text-emerald-600 hover:text-emerald-700"
                  title="Save"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => {
                    setEditingCategory(null);
                    setEditedCategoryName('');
                  }}
                  className="text-gray-600 hover:text-gray-700"
                  title="Cancel"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <>
                <span>{category}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(category)}
                    className="text-amber-600 hover:text-amber-700"
                    title="Edit"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => onDeleteCategory(category)}
                    className="text-red-600 hover:text-red-700"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
});

CategoryForm.displayName = 'CategoryForm';

// Memoized product card component
const ProductCard = memo(({
  product,
  onView,
  onEdit,
  onDelete
}: {
  product: Product;
  onView: (product: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}) => (
  <div className="card p-6 flex flex-col">
    <div className="flex items-center justify-between mb-4">
      <div className="p-3 bg-blue-100 rounded-xl">
        <Package className="text-blue-600" size={24} />
      </div>
      <div className="flex items-center gap-1">
        <button 
          onClick={() => onView(product)}
          className="btn-icon text-blue-600 hover:bg-blue-50" 
          title="View"
        >
          <Eye size={18} />
        </button>
        <button 
          onClick={() => onEdit(product)}
          className="btn-icon text-amber-600 hover:bg-amber-50" 
          title="Edit"
        >
          <Pencil size={18} />
        </button>
        <button 
          onClick={() => onDelete(product)}
          className="btn-icon text-red-600 hover:bg-red-50" 
          title="Delete"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold">{product.name}</h3>
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
        product.stock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
      }`}>
        {product.stock > 0 ? 'In Stock' : 'Out of Stock'}
      </span>
    </div>
    <p className="text-gray-600 text-sm mb-4 flex-grow">{product.description}</p>
    <div className="flex justify-between items-center pt-4 border-t border-gray-100">
      <span className="text-2xl font-bold text-blue-600">
        ${product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </span>
      <div className="text-sm">
        <span className="text-gray-500">Category: </span>
        <span className="font-medium">{product.category}</span>
      </div>
    </div>
  </div>
));

ProductCard.displayName = 'ProductCard';

const Products = () => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const { data: products, loading, error, add, update, remove } = useFirestore<Product>({
    collectionName: COLLECTIONS.PRODUCTS
  });

  const handleAdd = () => {
    setIsAddOpen(true);
  };

  const handleView = (product: Product) => {
    setSelectedProduct(product);
    setIsViewOpen(true);
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setIsEditOpen(true);
  };

  const handleDelete = (product: Product) => {
    setSelectedProduct(product);
    setIsDeleteConfirmOpen(true);
  };

  const handleSubmit = async (formData: ProductFormData) => {
    try {
      if (isAddOpen) {
        await add(formData);
        setIsAddOpen(false);
      } else if (isEditOpen && selectedProduct) {
        await update(selectedProduct.id, formData);
        setIsEditOpen(false);
      }
      setSelectedProduct(null);
    } catch (error) {
      console.error('Error handling product:', error);
      // Handle error appropriately
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedProduct) {
      try {
        await remove(selectedProduct.id);
        setIsDeleteConfirmOpen(false);
        setSelectedProduct(null);
      } catch (error) {
        console.error('Error deleting product:', error);
        // Handle error appropriately
      }
    }
  };

  const handleAddCategory = (category: string) => {
    if (!categories.includes(category)) {
      setCategories([...categories, category]);
    }
  };

  const handleDeleteCategory = (categoryToDelete: string) => {
    setCategories(categories.filter(category => category !== categoryToDelete));
  };

  const handleEditCategory = (oldCategory: string, newCategory: string) => {
    if (!categories.includes(newCategory)) {
      setCategories(categories.map(cat => 
        cat === oldCategory ? newCategory : cat
      ));
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Error loading products: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">Products</h1>
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white shadow-sm text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Grid View"
            >
              <LayoutGrid size={20} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white shadow-sm text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="List View"
            >
              <List size={20} />
            </button>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="btn-primary flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <Tags size={20} />
            Manage Categories
          </button>
          <button 
            onClick={handleAdd}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Add Product
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-sm text-gray-600">{product.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-blue-600">
                        ${product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        product.stock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => handleView(product)}
                        className="btn-icon text-blue-600 hover:bg-blue-50" 
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                      <button 
                        onClick={() => handleEdit(product)}
                        className="btn-icon text-amber-600 hover:bg-amber-50" 
                        title="Edit"
                      >
                        <Pencil size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(product)}
                        className="btn-icon text-red-600 hover:bg-red-50" 
                        title="Delete"
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
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Manage Categories</h2>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="btn-icon text-gray-500"
              >
                <X size={20} />
              </button>
            </div>
            <CategoryForm
              onSubmit={handleAddCategory}
              categories={categories}
              onDeleteCategory={handleDeleteCategory}
              onEditCategory={handleEditCategory}
            />
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {(isAddOpen || isEditOpen) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {isAddOpen ? 'Add Product' : 'Edit Product'}
              </h2>
              <button
                onClick={() => {
                  setIsAddOpen(false);
                  setIsEditOpen(false);
                }}
                className="btn-icon text-gray-500"
              >
                <X size={20} />
              </button>
            </div>
            <ProductForm
              onSubmit={handleSubmit}
              onCancel={() => {
                setIsAddOpen(false);
                setIsEditOpen(false);
              }}
              initialData={selectedProduct || initialFormData}
              isAdd={isAddOpen}
              categories={categories}
            />
          </div>
        </div>
      )}

      {/* View Modal */}
      {isViewOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Product Details</h2>
              <button
                onClick={() => setIsViewOpen(false)}
                className="btn-icon text-gray-500"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Name</label>
                <p className="text-gray-900">{selectedProduct.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Price</label>
                <p className="text-gray-900">
                  ${selectedProduct.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Category</label>
                <p className="text-gray-900">{selectedProduct.category}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Stock</label>
                <p className="text-gray-900">{selectedProduct.stock}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="text-gray-900">{selectedProduct.description}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Confirm Delete</h2>
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="btn-icon text-gray-500"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete {selectedProduct.name}? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
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

export default Products;