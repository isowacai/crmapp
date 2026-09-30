import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Plus, Pencil, Search, Clock, Users as TeamIcon, Timer, Send } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { canManageCatalog } from '../lib/roles';
import { Service, User } from '../types';
import Modal from '../components/Modal';

type ServiceFormData = Omit<Service, 'id'>;

const emptyService: ServiceFormData = {
  name: '',
  category: '',
  description: '',
  ownerTeam: '',
  standardEffortHours: 8,
  slaDays: 5,
  active: true
};

const inputClass =
  'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

const ServiceForm = ({
  initialData,
  categories,
  teams,
  onSubmit,
  onCancel
}: {
  initialData: ServiceFormData;
  categories: string[];
  teams: string[];
  onSubmit: (data: ServiceFormData) => void;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState<ServiceFormData>(initialData);
  const set = <K extends keyof ServiceFormData>(key: K, value: ServiceFormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Service name</label>
        <input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} required />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Category</label>
          <select className={inputClass} value={form.category} onChange={e => set('category', e.target.value)} required>
            <option value="">Select a category</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Delivering team</label>
          <input
            className={inputClass}
            value={form.ownerTeam}
            onChange={e => set('ownerTeam', e.target.value)}
            list="service-teams"
            required
          />
          <datalist id="service-teams">
            {teams.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          className={inputClass}
          rows={3}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Standard effort (hours)</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            className={inputClass}
            value={form.standardEffortHours}
            onChange={e => set('standardEffortHours', Number(e.target.value))}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Target turnaround (working days)</label>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={form.slaDays}
            onChange={e => set('slaDays', Number(e.target.value))}
            required
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="rounded" />
        Available for new requests
      </label>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" className="btn-primary">Save service</button>
      </div>
    </form>
  );
};

const ServiceCatalog = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isCatalogManager = canManageCatalog(user?.role);

  const { data: services, loading, error, add, update } = useFirestore<Service>({ collectionName: COLLECTIONS.SERVICES });
  const { data: categoryDocs } = useFirestore<{ name: string }>({ collectionName: COLLECTIONS.CATEGORIES });
  const { data: users } = useFirestore<User>({ collectionName: COLLECTIONS.USERS });

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editing, setEditing] = useState<Service | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const categories = useMemo(() => categoryDocs.map(c => c.name).sort(), [categoryDocs]);
  const teams = useMemo(
    () => [...new Set([...users.map(u => u.team), ...services.map(s => s.ownerTeam)].filter(Boolean) as string[])].sort(),
    [users, services]
  );

  const visible = services
    .filter(s => s.active || isCatalogManager)
    .filter(s => categoryFilter === 'all' || s.category === categoryFilter)
    .filter(s => `${s.name} ${s.description} ${s.ownerTeam}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const handleSave = async (form: ServiceFormData) => {
    try {
      setSaveError(null);
      if (editing) {
        await update(editing.id, form);
      } else {
        await add(form);
      }
      setEditing(null);
      setIsAddOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the service');
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
            <LayoutGrid className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Service Catalog</h1>
            <p className="text-gray-500 text-sm">Choose a service to raise a request</p>
          </div>
        </div>
        {isCatalogManager && (
          <button onClick={() => setIsAddOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus size={20} /> Add service
          </button>
        )}
      </div>

      {(error || saveError) && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600 border border-red-200">
          {saveError || `Error loading services: ${error?.message}`}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search services..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          {services.length === 0
            ? isCatalogManager
              ? 'The catalog is empty. Add your first service, or run `npm run load-services` to load a starter catalog.'
              : 'No services have been published yet.'
            : 'No services match your search.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {visible.map(service => (
            <div key={service.id} className={`card p-6 flex flex-col ${service.active ? '' : 'opacity-60'}`}>
              <div className="flex justify-between items-start gap-2 mb-2">
                <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-full">{service.category}</span>
                {!service.active && (
                  <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">Unavailable</span>
                )}
              </div>
              <h3 className="text-lg font-semibold">{service.name}</h3>
              <p className="text-sm text-gray-600 mt-1 flex-1">{service.description}</p>
              <div className="mt-4 space-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-2"><TeamIcon size={14} /> {service.ownerTeam}</div>
                <div className="flex items-center gap-2"><Clock size={14} /> ~{service.standardEffortHours}h effort</div>
                <div className="flex items-center gap-2"><Timer size={14} /> {service.slaDays} working day turnaround</div>
              </div>
              <div className="mt-5 flex gap-2">
                {service.active && (
                  <button
                    onClick={() => navigate('/requests', { state: { newRequestServiceId: service.id } })}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    <Send size={16} /> Request
                  </button>
                )}
                {isCatalogManager && (
                  <button onClick={() => setEditing(service)} className="btn-icon text-amber-600 border border-gray-200" title="Edit service">
                    <Pencil size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(isAddOpen || editing) && (
        <Modal
          title={editing ? 'Edit service' : 'Add service'}
          onClose={() => { setIsAddOpen(false); setEditing(null); }}
        >
          <ServiceForm
            initialData={editing ? {
              name: editing.name,
              category: editing.category,
              description: editing.description,
              ownerTeam: editing.ownerTeam,
              standardEffortHours: editing.standardEffortHours,
              slaDays: editing.slaDays,
              active: editing.active
            } : emptyService}
            categories={categories}
            teams={teams}
            onSubmit={handleSave}
            onCancel={() => { setIsAddOpen(false); setEditing(null); }}
          />
        </Modal>
      )}
    </div>
  );
};

export default ServiceCatalog;
