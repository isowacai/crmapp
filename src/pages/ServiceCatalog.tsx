import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Plus, Pencil, Search, Users as TeamIcon, Send, Link2 } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { canManageCatalog } from '../lib/roles';
import { Service, Team, User } from '../types';
import { applyTeamLinks, planTeamLinks } from '../services/teamService';
import { useVisibleRequests } from '../hooks/useVisibleRequests';
import Modal from '../components/Modal';
import ServiceForm from '../components/catalog/ServiceForm';
import { deliveringTeamIds, deliveringTeamNames, deliversService, emptyService, ServiceFormData } from '../lib/catalog';

const ServiceCatalog = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isCatalogManager = canManageCatalog(user?.role);

  const { data: services, loading, error, add, update } = useFirestore<Service>({ collectionName: COLLECTIONS.SERVICES });
  const { data: categoryDocs } = useFirestore<{ name: string }>({ collectionName: COLLECTIONS.CATEGORIES });
  const { data: teams, add: addTeam, update: updateTeam } = useFirestore<Team>({ collectionName: COLLECTIONS.TEAMS });
  const { data: users, update: updateUser } = useFirestore<User>({ collectionName: COLLECTIONS.USERS, enabled: user?.role === 'admin' });
  // Admins also link existing demand to its service's team
  const { data: requests, update: updateRequest } = useVisibleRequests(user?.role === 'admin' ? user : null);
  const [linking, setLinking] = useState(false);
  const [linkResult, setLinkResult] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editing, setEditing] = useState<Service | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const categories = useMemo(() => categoryDocs.map(c => c.name).sort(), [categoryDocs]);
  // Admins manage every service; managers the services their team delivers (enforced by the rules too)
  const isAdmin = user?.role === 'admin';
  const canEdit = (service: Service) => isCatalogManager && (isAdmin || deliversService(service, user?.teamId));
  const editableTeams = useMemo(
    () => teams.filter(t => isAdmin || t.id === user?.teamId).sort((a, b) => a.name.localeCompare(b.name)),
    [teams, isAdmin, user?.teamId]
  );

  const visible = services
    .filter(s => s.active || isCatalogManager)
    .filter(s => categoryFilter === 'all' || s.category === categoryFilter)
    .filter(s => `${s.name} ${s.description} ${deliveringTeamNames(s, teams)}`.toLowerCase().includes(search.toLowerCase()))
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
        {isCatalogManager && editableTeams.length > 0 && (
          <button onClick={() => setIsAddOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus size={20} /> Add service
          </button>
        )}
      </div>

      {/* Services must belong to a team before they can be requested (data from before team records existed) */}
      {(() => {
        const unlinked = services.filter(s => deliveringTeamIds(s).length === 0);
        const plan = planTeamLinks(services, users, teams, requests);
        if (unlinked.length === 0 && plan.requestLinks.length === 0) return null;
        const people = plan.userLinks.length === 1 ? '1 person' : `${plan.userLinks.length} people`;
        const linkSummary = [
          plan.serviceLinks.length || plan.requestLinks.length
            ? `Link ${plan.serviceLinks.length} ${plan.serviceLinks.length === 1 ? 'service' : 'services'} by their team name` +
              (plan.teamsToCreate.length ? ` (creating ${plan.teamsToCreate.join(', ')})` : '') +
              (plan.userLinks.length ? `, add ${people} to their named team` : '') +
              (plan.requestLinks.length ? `, and link ${plan.requestLinks.length} existing requests` : '') +
              '.'
            : '',
          plan.unlinkable.length ? `Edit ${plan.unlinkable.map(x => x.name).join(', ')} to choose a team.` : ''
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm">
            <p className="font-medium">
              {unlinked.length > 0
                ? `${unlinked.length} ${unlinked.length === 1 ? "service isn't" : "services aren't"} linked to a team yet, so ${unlinked.length === 1 ? 'it' : 'they'} can't be requested.`
                : `${plan.requestLinks.length} existing ${plan.requestLinks.length === 1 ? "request isn't" : "requests aren't"} linked to a team yet, so team leads can't see ${plan.requestLinks.length === 1 ? 'it' : 'them'}.`}
            </p>
            {user?.role === 'admin' ? (
              <>
                <p className="mt-1">{linkSummary}</p>
                {(plan.serviceLinks.length > 0 || plan.requestLinks.length > 0) && (
                  <button
                    disabled={linking}
                    onClick={async () => {
                      setLinking(true);
                      setSaveError(null);
                      try {
                        await applyTeamLinks(
                          plan,
                          teams,
                          { addTeam, updateTeam, updateService: update, updateUser, updateRequest },
                          { id: user!.id, name: user!.displayName }
                        );
                        setLinkResult(
                          `Linked ${plan.serviceLinks.length} services` +
                            (plan.requestLinks.length ? ` and ${plan.requestLinks.length} requests` : '') +
                            (plan.teamsToCreate.length ? `; created ${plan.teamsToCreate.length} teams` : '') +
                            '. Requests can now be raised for these services.'
                        );
                      } catch (err) {
                        setSaveError(err instanceof Error ? err.message : 'Could not link services to teams');
                      } finally {
                        setLinking(false);
                      }
                    }}
                    className="mt-3 btn-primary flex items-center gap-2 disabled:opacity-60"
                  >
                    <Link2 size={16} /> {linking ? 'Linking…' : plan.serviceLinks.length ? 'Link services to teams' : 'Link requests to teams'}
                  </button>
                )}
              </>
            ) : (
              <p className="mt-1">Ask an admin to link them (Service Catalog → Link services to teams).</p>
            )}
          </div>
        );
      })()}
      {linkResult && <div className="mb-6 p-4 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-sm">{linkResult}</div>}

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
                <div className="flex items-start gap-2"><TeamIcon size={14} className="mt-0.5 shrink-0" /> {deliveringTeamNames(service, teams)}</div>
              </div>
              <div className="mt-5 flex gap-2">
                {service.active && (
                  <button
                    onClick={() => navigate('/requests', { state: { newRequestServiceId: service.id } })}
                    disabled={deliveringTeamIds(service).length === 0}
                    title={deliveringTeamIds(service).length === 0 ? "Not available until it's linked to a team" : undefined}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={16} /> Request
                  </button>
                )}
                {canEdit(service) && (
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
              teamIds: deliveringTeamIds(editing),
              active: editing.active,
              requestFields: editing.requestFields ?? []
            } : emptyService(editableTeams.length === 1 ? editableTeams[0] : undefined)}
            categories={categories}
            teams={teams}
            editableTeamIds={editableTeams.map(t => t.id)}
            onSubmit={handleSave}
            onCancel={() => { setIsAddOpen(false); setEditing(null); }}
          />
        </Modal>
      )}
    </div>
  );
};

export default ServiceCatalog;
