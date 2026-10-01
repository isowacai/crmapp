import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Settings2, Plus, Users as UsersIcon } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { canManageRequests, managesTeam, normalizeRole, ROLE_LABELS, DEFAULT_WEEKLY_CAPACITY } from '../lib/roles';
import { teamModel } from '../lib/priority';
import { AssessmentCriterion, PriorityThresholds, Service, Team, User } from '../types';
import Modal from '../components/Modal';
import PriorityModelEditor from '../components/workspace/PriorityModelEditor';
import { checkModel, newTeam, renameTeam } from '../services/teamService';

const inputClass = 'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

// Team (workspace) configuration: team details and the assessment / priority model
const Workspace = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data: teams, loading, error, add: addTeam, update: updateTeam } = useFirestore<Team>({ collectionName: COLLECTIONS.TEAMS });
  const { data: users, update: updateUser } = useFirestore<User>({ collectionName: COLLECTIONS.USERS });
  const { data: services, update: updateService } = useFirestore<Service>({ collectionName: COLLECTIONS.SERVICES });

  const visibleTeams = useMemo(
    () => teams.filter(t => isAdmin || t.id === user?.teamId).sort((a, b) => a.name.localeCompare(b.name)),
    [teams, isAdmin, user?.teamId]
  );
  const [teamId, setTeamId] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [detailsMessage, setDetailsMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [draft, setDraft] = useState({ name: '', description: '' });

  const team = visibleTeams.find(t => t.id === teamId) ?? visibleTeams[0];

  useEffect(() => {
    if (team) setDraft({ name: team.name, description: team.description ?? '' });
  }, [team]);

  if (!canManageRequests(user?.role)) return <Navigate to="/dashboard" replace />;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const canEdit = !!team && managesTeam(user, team.id);
  // Renaming updates members' profiles too, which the rules allow for managers and admins
  const canRename = canEdit && (isAdmin || user?.role === 'manager');
  const members = team ? users.filter(u => u.teamId === team.id) : [];
  const teamServices = team ? services.filter(s => s.teamId === team.id) : [];
  const model = teamModel(team);

  const handleCreate = async () => {
    try {
      const created = await addTeam(newTeam(newName));
      setTeamId(created.id);
      setCreating(false);
      setNewName('');
    } catch (err) {
      setDetailsMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not create the team' });
      setCreating(false);
    }
  };

  const saveDetails = async () => {
    if (!team) return;
    setDetailsMessage(null);
    try {
      if (draft.name.trim() !== team.name) {
        await renameTeam(team.name, draft.name, { teams, users, services, canCreate: isAdmin }, {
          updateTeam,
          addTeam,
          updateUser,
          updateService
        });
      }
      if ((team.description ?? '') !== draft.description) await updateTeam(team.id, { description: draft.description.trim() });
      setDetailsMessage({ tone: 'ok', text: 'Team details saved.' });
    } catch (err) {
      setDetailsMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save' });
    }
  };

  const toggleManager = async (id: string) => {
    if (!team) return;
    const managerIds = team.managerIds?.includes(id) ? team.managerIds.filter(m => m !== id) : [...(team.managerIds ?? []), id];
    await updateTeam(team.id, { managerIds });
  };

  const saveModel = async (assessmentCriteria: AssessmentCriterion[], priorityThresholds: PriorityThresholds) => {
    if (!team) return;
    checkModel({ assessmentCriteria, priorityThresholds });
    await updateTeam(team.id, { assessmentCriteria, priorityThresholds });
  };

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
            <Settings2 className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Workspace</h1>
            <p className="text-gray-500 text-sm">How your team assesses and prioritizes the demand it receives</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {visibleTeams.length > 1 && (
            <select value={team?.id ?? ''} onChange={e => setTeamId(e.target.value)} className="rounded-lg border-gray-300" aria-label="Team">
              {visibleTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {isAdmin && (
            <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2">
              <Plus size={18} /> New team
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600 border border-red-200">Error loading teams: {error.message}</div>}

      {!team ? (
        <div className="card p-10 text-center text-gray-600">
          {isAdmin
            ? 'No teams yet. Create one, or run the team migration (npm run migrate:teams) to create teams from existing data.'
            : "You're not a member of a team yet. Ask an admin to add you to one."}
        </div>
      ) : (
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Team</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team name</label>
                  <input className={inputClass} value={draft.name} disabled={!canRename} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">What the team does</label>
                  <textarea className={inputClass} rows={3} value={draft.description} disabled={!canEdit} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
                </div>
                {canEdit && (
                  <button
                    onClick={saveDetails}
                    disabled={draft.name.trim() === team.name && draft.description === (team.description ?? '')}
                    className="btn-primary disabled:opacity-50"
                  >
                    Save team details
                  </button>
                )}
                {detailsMessage && (
                  <div className={`p-3 rounded-lg text-sm ${detailsMessage.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-600'}`}>{detailsMessage.text}</div>
                )}
                <p className="text-sm text-gray-600">
                  Delivers <strong>{teamServices.length}</strong> catalog {teamServices.length === 1 ? 'service' : 'services'}
                  {teamServices.length > 0 && `: ${teamServices.map(s => s.name).join(', ')}`}.
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <UsersIcon size={16} /> Members ({members.length})
                </p>
                {members.length === 0 ? (
                  <p className="text-sm text-gray-500">No members yet. Admins add people to teams on the Users page.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                    {members.map(m => {
                      const role = normalizeRole(m.role);
                      const isTeamManager = team.managerIds?.includes(m.id);
                      return (
                        <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{m.displayName}</p>
                            <p className="text-xs text-gray-500">{ROLE_LABELS[role]} · {m.weeklyCapacityHours ?? DEFAULT_WEEKLY_CAPACITY}h / week</p>
                          </div>
                          {(role === 'lead' || role === 'manager' || role === 'admin') && (
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 shrink-0">
                              <input type="checkbox" checked={!!isTeamManager} disabled={!canEdit} onChange={() => toggleManager(m.id)} className="rounded" />
                              Runs this workspace
                            </label>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-semibold">Assessment &amp; prioritization</h2>
            <p className="text-sm text-gray-500 mb-5">
              Assessors score each request on these criteria. The weighted score (0–100) sets the calculated priority;
              managers can still override it with a reason.
            </p>
            <PriorityModelEditor
              key={team.id}
              criteria={model.criteria}
              thresholds={model.thresholds}
              readOnly={!canEdit}
              onSave={saveModel}
            />
          </section>
        </div>
      )}

      {creating && (
        <Modal title="New team" subtitle="Starts with the default assessment and priority model" onClose={() => setCreating(false)} width="max-w-md">
          <form onSubmit={e => { e.preventDefault(); handleCreate(); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Team name</label>
              <input className={inputClass} value={newName} onChange={e => setNewName(e.target.value)} autoFocus required />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" className="btn-primary">Create team</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Workspace;
