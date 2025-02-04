import React, { useState, memo } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { COLLECTIONS } from '../lib/firebase';
import { Task } from '../types';
import { Calendar, User, Plus, Eye, Pencil, Trash2, X, LayoutGrid, List } from 'lucide-react';

interface TaskFormData {
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  dueDate: string;
  assignedTo: string;
  priority: 'low' | 'medium' | 'high';
}

const initialFormData: TaskFormData = {
  title: '',
  description: '',
  status: 'pending',
  dueDate: new Date().toISOString().split('T')[0],
  assignedTo: '',
  priority: 'medium'
};

// Memoized form component
const TaskForm = memo(({
  onSubmit,
  onCancel,
  initialData = initialFormData,
  isAdd = true
}: {
  onSubmit: (data: TaskFormData) => void;
  onCancel: () => void;
  initialData?: TaskFormData;
  isAdd?: boolean;
}) => {
  const [formData, setFormData] = useState<TaskFormData>(initialData);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = <K extends keyof TaskFormData>(field: K, value: TaskFormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Title</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => handleChange('title', e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Status</label>
        <select
          value={formData.status}
          onChange={(e) => handleChange('status', e.target.value as TaskFormData['status'])}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="pending">Pending</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Due Date</label>
        <input
          type="date"
          value={formData.dueDate}
          onChange={(e) => handleChange('dueDate', e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Assigned To</label>
        <input
          type="text"
          value={formData.assignedTo}
          onChange={(e) => handleChange('assignedTo', e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Priority</label>
        <select
          value={formData.priority}
          onChange={(e) => handleChange('priority', e.target.value as TaskFormData['priority'])}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
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
          {isAdd ? 'Add Task' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
});

TaskForm.displayName = 'TaskForm';

// Memoized task card component
const TaskCard = memo(({
  task,
  onView,
  onEdit,
  onDelete
}: {
  task: Task;
  onView: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) => (
  <div className="card p-6 flex flex-col">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-3 rounded-xl ${
        task.priority === 'high'
          ? 'bg-red-100 text-red-600'
          : task.priority === 'medium'
          ? 'bg-amber-100 text-amber-600'
          : 'bg-emerald-100 text-emerald-600'
      }`}>
        <Calendar size={24} />
      </div>
      <div className="flex items-center gap-1">
        <button 
          onClick={() => onView(task)}
          className="btn-icon text-blue-600 hover:bg-blue-50" 
          title="View"
        >
          <Eye size={18} />
        </button>
        <button 
          onClick={() => onEdit(task)}
          className="btn-icon text-amber-600 hover:bg-amber-50" 
          title="Edit"
        >
          <Pencil size={18} />
        </button>
        <button 
          onClick={() => onDelete(task)}
          className="btn-icon text-red-600 hover:bg-red-50" 
          title="Delete"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold">{task.title}</h3>
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
        task.status === 'completed'
          ? 'bg-emerald-100 text-emerald-800'
          : task.status === 'in-progress'
          ? 'bg-blue-100 text-blue-800'
          : 'bg-amber-100 text-amber-800'
      }`}>
        {task.status.replace('-', ' ')}
      </span>
    </div>
    <p className="text-gray-600 text-sm mb-4 flex-grow">{task.description}</p>
    <div className="flex justify-between items-center pt-4 border-t border-gray-100">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Calendar size={16} className="text-gray-400" />
        {task.dueDate}
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <User size={16} className="text-gray-400" />
        {task.assignedTo}
      </div>
    </div>
  </div>
));

TaskCard.displayName = 'TaskCard';

const Tasks = () => {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  const { data: tasks, loading, error, add, update, remove } = useFirestore<Task>({
    collectionName: COLLECTIONS.TASKS
  });

  const handleAdd = () => {
    setIsAddOpen(true);
  };

  const handleView = (task: Task) => {
    setSelectedTask(task);
    setIsViewOpen(true);
  };

  const handleEdit = (task: Task) => {
    setSelectedTask(task);
    setIsEditOpen(true);
  };

  const handleDelete = (task: Task) => {
    setSelectedTask(task);
    setIsDeleteConfirmOpen(true);
  };

  const handleSubmit = async (formData: TaskFormData) => {
    try {
      if (isAddOpen) {
        await add(formData);
        setIsAddOpen(false);
      } else if (isEditOpen && selectedTask) {
        await update(selectedTask.id, formData);
        setIsEditOpen(false);
      }
      setSelectedTask(null);
    } catch (error) {
      console.error('Error handling task:', error);
      // Handle error appropriately
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedTask) {
      try {
        await remove(selectedTask.id);
        setIsDeleteConfirmOpen(false);
        setSelectedTask(null);
      } catch (error) {
        console.error('Error deleting task:', error);
        // Handle error appropriately
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

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Error loading tasks: {error.message}
        </div>
      </div>
    );
  }

  const tasksByStatus = {
    pending: tasks.filter(task => task.status === 'pending'),
    'in-progress': tasks.filter(task => task.status === 'in-progress'),
    completed: tasks.filter(task => task.status === 'completed')
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">Tasks</h1>
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-white shadow-sm text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Kanban View"
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
        <button 
          onClick={handleAdd}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          Add Task
        </button>
      </div>

      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {Object.entries(tasksByStatus).map(([status, statusTasks]) => (
            <div key={status} className="card p-6">
              <h2 className="text-xl font-semibold mb-6 capitalize flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${
                  status === 'pending' ? 'bg-amber-500' :
                  status === 'in-progress' ? 'bg-blue-500' :
                  'bg-emerald-500'
                }`} />
                {status.replace('-', ' ')}
                <span className="ml-2 text-sm text-gray-500">
                  ({statusTasks.length})
                </span>
              </h2>
              <div className="space-y-4">
                {statusTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Due Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-gray-600">{task.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        task.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : task.status === 'in-progress'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {task.status.replace('-', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {task.dueDate}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {task.assignedTo}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        task.priority === 'high'
                          ? 'bg-red-100 text-red-800'
                          : task.priority === 'medium'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => handleView(task)}
                        className="btn-icon text-blue-600 hover:bg-blue-50" 
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                      <button 
                        onClick={() => handleEdit(task)}
                        className="btn-icon text-amber-600 hover:bg-amber-50" 
                        title="Edit"
                      >
                        <Pencil size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(task)}
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

      {/* Add/Edit Modal */}
      {(isAddOpen || isEditOpen) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {isAddOpen ? 'Add Task' : 'Edit Task'}
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
            <TaskForm
              onSubmit={handleSubmit}
              onCancel={() => {
                setIsAddOpen(false);
                setIsEditOpen(false);
              }}
              initialData={selectedTask || initialFormData}
              isAdd={isAddOpen}
            />
          </div>
        </div>
      )}

      {/* View Modal */}
      {isViewOpen && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Task Details</h2>
              <button
                onClick={() => setIsViewOpen(false)}
                className="btn-icon text-gray-500"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Title</label>
                <p className="text-gray-900">{selectedTask.title}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="text-gray-900">{selectedTask.description}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <p className="text-gray-900 capitalize">{selectedTask.status.replace('-', ' ')}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Due Date</label>
                <p className="text-gray-900">{selectedTask.dueDate}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Assigned To</label>
                <p className="text-gray-900">{selectedTask.assignedTo}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Priority</label>
                <p className="text-gray-900 capitalize">{selectedTask.priority}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && selectedTask && (
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
              Are you sure you want to delete "{selectedTask.title}"? This action cannot be undone.
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

export default Tasks;