import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Search, LayoutGrid, List, X } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { useVisibleRequests } from '../hooks/useVisibleRequests';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { canManageRequests, DEFAULT_WEEKLY_CAPACITY } from '../lib/roles';
import { formatHours, INTAKE_STATUSES, isOpen, isOverdue, PRIORITIES, STATUS_STYLES } from '../lib/demand';
import { PRIORITY_STYLES } from '../lib/priority';
import { activeFilterCount, DEFAULT_FILTERS, DemandFilters, DemandScope, filterDemand } from '../lib/demandFilters';
import { PriorityLevel, RequestStatus, Service, Team, User } from '../types';
import Modal from '../components/Modal';
import { PriorityBadge, StatusBadge } from '../components/RequestBadges';
import NewRequestForm, { NewRequestData } from '../components/requests/NewRequestForm';
import RequestDetails, { RequestChange } from '../components/requests/RequestDetails';
import PipelineBoard from '../components/demand/PipelineBoard';
import { createRequest } from '../services/requestCommands';
import { createNumberedRequest } from '../services/requestRepository';

type View = 'board' | 'list';

const VIEW_KEY = 'demand.view';
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
};

const selectClass = 'rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500';

const Requests = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isManager = canManageRequests(user?.role);

  const { data: requests, loading, error, update, reload } = useVisibleRequests(user);
  const { data: services } = useFirestore<Service>({ collectionName: COLLECTIONS.SERVICES });
  const { data: users } = useFirestore<User>({ collectionName: COLLECTIONS.USERS });
  const { data: teams } = useFirestore<Team>({ collectionName: COLLECTIONS.TEAMS, enabled: isManager });

  const [view, setViewState] = useState<View>(readView);
  const [filters, setFilters] = useState<DemandFilters>({ ...DEFAULT_FILTERS, scope: isManager ? 'team' : 'mine' });
  const [showClosed, setShowClosed] = useState(false);
  const [newServiceId, setNewServiceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Remembering the view is optional
    }
  };
  const setFilter = <K extends keyof DemandFilters>(key: K, value: DemandFilters[K]) => setFilters(prev => ({ ...prev, [key]: value }));

  // Other pages link here with state: the catalog's "Request" button opens the new-request form,
  // and the Capacity page and dashboard open a specific request
  useEffect(() => {
    const state = location.state as { newRequestServiceId?: string; openRequestId?: string } | null;
    if (state?.newRequestServiceId) setNewServiceId(state.newRequestServiceId);
    if (state?.openRequestId) setSelectedId(state.openRequestId);
    if (state?.newRequestServiceId || state?.openRequestId) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const activeServices = useMemo(
    () => services.filter(s => s.active).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [services]
  );
  const weeklyCapacityByUser = useMemo(
    () => new Map(users.map(u => [u.id, u.weeklyCapacityHours ?? DEFAULT_WEEKLY_CAPACITY])),
    [users]
  );

  if (!user) return null;

  const visible = filterDemand(requests, filters, user.id, { ignoreStatus: view === 'board' });
  const selected = requests.find(r => r.id === selectedId) || null;

  const scopes: { id: DemandScope; label: string; count: number }[] = [
    ...(isManager
      ? [{ id: 'team' as DemandScope, label: user.role === 'admin' ? 'All demand' : 'Team demand', count: requests.filter(isOpen).length }]
      : []),
    { id: 'mine', label: 'Raised by me', count: requests.filter(r => r.requesterId === user.id && isOpen(r)).length },
    { id: 'assigned', label: 'Assigned to me', count: requests.filter(r => r.assigneeId === user.id && isOpen(r)).length }
  ];
  const needsAssessment = requests.filter(r => INTAKE_STATUSES.includes(r.status)).length;

  // People who appear on visible demand, for the owner/requester filters
  const owners = [...new Map(requests.filter(r => r.assigneeId).map(r => [r.assigneeId, r.assigneeName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const requesters = [...new Map(requests.map(r => [r.requesterId, r.requesterName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const handleCreate = async (data: NewRequestData) => {
    try {
      setSaveError(null);
      const service = services.find(s => s.id === data.serviceId);
      if (!service) throw new Error('Please choose a service');

      const created = await createNumberedRequest(
        requestNumber => createRequest(data, service, user, requestNumber),
        requests.map(r => r.requestNumber)
      );
      reload();
      setNewServiceId(null);
      setSelectedId(created.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not submit the request');
      throw err;
    }
  };

  const handleChange: RequestChange = async patch => {
    if (!selected) return;
    await update(selected.id, patch);
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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
            <ClipboardList className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Demand</h1>
            <p className="text-gray-500 text-sm">What's being asked of the team, and where it is in the pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
            {([['board', LayoutGrid, 'Board'], ['list', List, 'List']] as const).map(([id, Icon, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${view === id ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
          <button onClick={() => setNewServiceId('')} className="btn-primary flex items-center gap-2">
            <Plus size={20} /> New request
          </button>
        </div>
      </div>

      {(error || saveError) && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600 border border-red-200">
          {saveError || `Error loading demand: ${error?.message}`}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {scopes.map(s => (
          <button
            key={s.id}
            onClick={() => setFilter('scope', s.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.scope === s.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s.label}
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${filters.scope === s.id ? 'bg-blue-500' : 'bg-gray-100'}`}>{s.count}</span>
          </button>
        ))}
        {isManager && needsAssessment > 0 && (
          <button
            onClick={() => { setFilters({ ...DEFAULT_FILTERS, scope: 'team', status: 'new' }); setView('list'); }}
            className="px-3 py-2 rounded-lg text-sm font-medium text-purple-800 bg-purple-50 border border-purple-200 hover:bg-purple-100"
          >
            {needsAssessment} waiting for assessment →
          </button>
        )}
      </div>

      <div className="card p-4 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search number, title, service, or person..."
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
            className="pl-9 w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <select value={filters.serviceId} onChange={e => setFilter('serviceId', e.target.value)} className={selectClass} aria-label="Service">
          <option value="">All services</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {view === 'list' && (
          <select value={filters.status} onChange={e => setFilter('status', e.target.value as RequestStatus | 'open' | 'all')} className={selectClass} aria-label="Status">
            <option value="open">Open</option>
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_STYLES) as RequestStatus[]).map(s => <option key={s} value={s}>{STATUS_STYLES[s].label}</option>)}
          </select>
        )}
        <select value={filters.priority} onChange={e => setFilter('priority', e.target.value as PriorityLevel | 'none' | 'all')} className={selectClass} aria-label="Priority">
          <option value="all">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_STYLES[p].label}</option>)}
          <option value="none">Not assessed</option>
        </select>
        <select value={filters.ownerId} onChange={e => setFilter('ownerId', e.target.value)} className={selectClass} aria-label="Owner">
          <option value="">Any owner</option>
          <option value="-">No owner yet</option>
          {owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        {isManager && (
          <select value={filters.requesterId} onChange={e => setFilter('requesterId', e.target.value)} className={selectClass} aria-label="Requester">
            <option value="">Any requester</option>
            {requesters.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        {user.role === 'admin' && teams.length > 1 && (
          <select value={filters.teamId} onChange={e => setFilter('teamId', e.target.value)} className={selectClass} aria-label="Team">
            <option value="">All teams</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1 text-sm text-gray-600">
          From <input type="date" value={filters.createdFrom} onChange={e => setFilter('createdFrom', e.target.value)} className={selectClass} />
        </label>
        <label className="flex items-center gap-1 text-sm text-gray-600">
          to <input type="date" value={filters.createdTo} onChange={e => setFilter('createdTo', e.target.value)} className={selectClass} />
        </label>
        {view === 'board' && (
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} className="rounded" />
            Show deferred, declined &amp; cancelled
          </label>
        )}
        {activeFilterCount(filters) > 0 && (
          <button
            onClick={() => setFilters({ ...DEFAULT_FILTERS, scope: filters.scope })}
            className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            <X size={14} /> Clear filters
          </button>
        )}
      </div>

      {view === 'board' ? (
        <PipelineBoard requests={visible} weeklyCapacityByUser={weeklyCapacityByUser} showClosed={showClosed} onOpen={setSelectedId} />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3 text-left">Request</th>
                  <th className="px-6 py-3 text-left">Service</th>
                  <th className="px-6 py-3 text-left">Requester</th>
                  <th className="px-6 py-3 text-left">Priority</th>
                  <th className="px-6 py-3 text-left">Status</th>
                  <th className="px-6 py-3 text-left">Owner</th>
                  <th className="px-6 py-3 text-left">Target</th>
                  <th className="px-6 py-3 text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-gray-500">No demand matches these filters.</td>
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
                      <td className="px-6 py-4"><PriorityBadge priority={r.priority} overridden={!!r.priorityOverride} score={r.priorityScore} /></td>
                      <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                      <td className="px-6 py-4 text-sm text-gray-700">{r.assigneeName || '—'}</td>
                      <td className={`px-6 py-4 text-sm whitespace-nowrap ${isOverdue(r) ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                        {r.dueDate || (r.neededBy ? `wanted ${r.neededBy}` : '—')}
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
      )}

      {newServiceId !== null && (
        <Modal title="New service request" subtitle="Describe what you need; the delivering team will assess and prioritize it" onClose={() => setNewServiceId(null)}>
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
            team={teams.find(t => t.id === selected.teamId)}
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
