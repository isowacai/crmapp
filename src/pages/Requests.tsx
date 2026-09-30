import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Search, Filter } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { canManageRequests } from '../lib/roles';
import {
  formatHours,
  generateDailyNumber,
  isOpen,
  isOverdue,
  PRIORITIES,
  priorityRank,
  STATUS_STYLES
} from '../lib/demand';
import { Priority, RequestStatus, Service, ServiceRequest, User } from '../types';
import Modal from '../components/Modal';
import { PriorityBadge, StatusBadge } from '../components/RequestBadges';
import NewRequestForm, { NewRequestData } from '../components/requests/NewRequestForm';
import RequestDetails, { RequestChange } from '../components/requests/RequestDetails';

type Tab = 'mine' | 'assigned' | 'triage' | 'all';

const Requests = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isManager = canManageRequests(user?.role);

  const { data: requests, loading, error, add, update } = useFirestore<ServiceRequest>({ collectionName: COLLECTIONS.REQUESTS });
  const { data: services } = useFirestore<Service>({ collectionName: COLLECTIONS.SERVICES });
  const { data: users } = useFirestore<User>({ collectionName: COLLECTIONS.USERS });

  const [tab, setTab] = useState<Tab>(isManager ? 'triage' : 'mine');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'open' | 'all'>('open');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'none' | 'all'>('all');
  const [newServiceId, setNewServiceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Other pages link here with state: the catalog's "Request" button opens the new-request form,
  // and the Capacity page opens a specific request
  useEffect(() => {
    const state = location.state as { newRequestServiceId?: string; openRequestId?: string } | null;
    if (state?.newRequestServiceId) setNewServiceId(state.newRequestServiceId);
    if (state?.openRequestId) {
      setSelectedId(state.openRequestId);
      if (isManager) setTab('all');
    }
    if (state?.newRequestServiceId || state?.openRequestId) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate, isManager]);

  const activeServices = useMemo(
    () => services.filter(s => s.active).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [services]
  );

  if (!user) return null;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'mine', label: 'My requests', count: requests.filter(r => r.requesterId === user.id && isOpen(r)).length },
    { id: 'assigned', label: 'Assigned to me', count: requests.filter(r => r.assigneeId === user.id && isOpen(r)).length },
    ...(isManager
      ? [
          { id: 'triage' as Tab, label: 'Triage queue', count: requests.filter(r => r.status === 'submitted').length },
          { id: 'all' as Tab, label: 'All requests', count: requests.filter(isOpen).length }
        ]
      : [])
  ];

  const visible = requests
    .filter(r => {
      if (tab === 'mine') return r.requesterId === user.id;
      if (tab === 'assigned') return r.assigneeId === user.id;
      if (tab === 'triage') return r.status === 'submitted';
      return true;
    })
    .filter(r => (tab === 'triage' || statusFilter === 'all' ? true : statusFilter === 'open' ? isOpen(r) : r.status === statusFilter))
    .filter(r => priorityFilter === 'all' || (priorityFilter === 'none' ? !r.priority : r.priority === priorityFilter))
    .filter(r =>
      `${r.requestNumber} ${r.title} ${r.serviceName} ${r.requesterName} ${r.assigneeName}`.toLowerCase().includes(search.toLowerCase())
    )
    .sort(
      (a, b) =>
        Number(isOpen(b)) - Number(isOpen(a)) ||
        priorityRank(a.priority) - priorityRank(b.priority) ||
        (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
    );

  const selected = requests.find(r => r.id === selectedId) || null;

  const historyEntry = (entry: Parameters<RequestChange>[1]) => ({
    ...entry,
    at: new Date().toISOString(),
    byId: user.id,
    byName: user.displayName
  });

  const handleCreate = async (data: NewRequestData) => {
    try {
      setSaveError(null);
      const service = services.find(s => s.id === data.serviceId);
      if (!service) throw new Error('Please choose a service');

      const requestNumber = generateDailyNumber('REQ', requests.map(r => r.requestNumber));
      const request: Omit<ServiceRequest, 'id' | 'createdAt'> = {
        requestNumber,
        serviceId: service.id,
        serviceName: service.name,
        category: service.category,
        title: data.title,
        description: data.description,
        businessJustification: data.businessJustification,
        requesterId: user.id,
        requesterName: user.displayName,
        requesterTeam: user.team || '',
        // Impact, urgency, and priority are set by a lead or manager during triage
        impact: '',
        urgency: '',
        priority: '',
        status: 'submitted',
        neededBy: data.neededBy,
        assigneeId: '',
        assigneeName: '',
        assigneeTeam: '',
        estimatedHours: 0,
        loggedHours: 0,
        startDate: '',
        dueDate: '',
        assignedAt: '',
        completedAt: '',
        history: [historyEntry({ action: 'Submitted', toStatus: 'submitted' })]
      };
      // The request number doubles as the document ID
      await add(request, requestNumber);
      setNewServiceId(null);
      setTab('mine');
      setSelectedId(requestNumber);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not submit the request');
      throw err;
    }
  };

  const handleChange: RequestChange = async (changes, entry) => {
    if (!selected) return;
    await update(selected.id, { ...changes, history: [...selected.history, historyEntry(entry)] });
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
            <ClipboardList className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Service Requests</h1>
            <p className="text-gray-500 text-sm">Raise, triage, and track requests for service</p>
          </div>
        </div>
        <button onClick={() => setNewServiceId('')} className="btn-primary flex items-center gap-2">
          <Plus size={20} /> New request
        </button>
      </div>

      {(error || saveError) && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600 border border-red-200">
          {saveError || `Error loading requests: ${error?.message}`}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label}
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${tab === t.id ? 'bg-blue-500' : 'bg-gray-100'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by number, title, service, or person..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-400" />
            {tab !== 'triage' && (
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as RequestStatus | 'open' | 'all')}
                className="rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="open">Open</option>
                <option value="all">All statuses</option>
                {(Object.keys(STATUS_STYLES) as RequestStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_STYLES[s].label}</option>
                ))}
              </select>
            )}
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value as Priority | 'none' | 'all')}
              className="rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="all">All priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              <option value="none">Not set</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3 text-left">Request</th>
                <th className="px-6 py-3 text-left">Service</th>
                <th className="px-6 py-3 text-left">Requester</th>
                <th className="px-6 py-3 text-left">Priority</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Assignee</th>
                <th className="px-6 py-3 text-left">Due</th>
                <th className="px-6 py-3 text-right">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-gray-500">
                    {tab === 'triage' ? 'Nothing waiting for triage.' : 'No requests match these filters.'}
                  </td>
                </tr>
              ) : (
                visible.map(r => (
                  <tr key={r.id} onClick={() => setSelectedId(r.id)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-xs font-mono text-gray-500">{r.requestNumber}</div>
                      <div className="font-medium text-gray-900">{r.title}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{r.serviceName}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{r.requesterName}</td>
                    <td className="px-6 py-4"><PriorityBadge priority={r.priority} /></td>
                    <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                    <td className="px-6 py-4 text-sm text-gray-700">{r.assigneeName || '—'}</td>
                    <td className={`px-6 py-4 text-sm whitespace-nowrap ${isOverdue(r) ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                      {r.dueDate || (r.neededBy ? `needed ${r.neededBy}` : '—')}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-700 tabular-nums whitespace-nowrap">
                      {r.estimatedHours ? `${formatHours(r.loggedHours)} / ${formatHours(r.estimatedHours)}` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {newServiceId !== null && (
        <Modal title="New service request" subtitle="Describe what you need; a lead or manager will triage it" onClose={() => setNewServiceId(null)}>
          {activeServices.length === 0 ? (
            <p className="text-gray-600">No services are available yet. Ask an admin or manager to set up the service catalog.</p>
          ) : (
            <NewRequestForm
              services={activeServices}
              initialServiceId={newServiceId}
              onSubmit={handleCreate}
              onCancel={() => setNewServiceId(null)}
            />
          )}
        </Modal>
      )}

      {selected && (
        <Modal title={selected.title} subtitle={selected.requestNumber} onClose={() => setSelectedId(null)} width="max-w-3xl">
          <RequestDetails
            key={selected.id}
            request={selected}
            service={services.find(s => s.id === selected.serviceId)}
            currentUser={user}
            users={users}
            requests={requests}
            onChange={handleChange}
          />
        </Modal>
      )}
    </div>
  );
};

export default Requests;
