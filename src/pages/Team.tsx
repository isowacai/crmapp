import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { UserMinus, UserPlus, Users as UsersIcon } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { canManageRequests, managesTeam, normalizeRole, ROLE_LABELS, DEFAULT_WEEKLY_CAPACITY } from '../lib/roles';
import { teamModel } from '../lib/priority';
import { linesOfBusinessOf } from '../lib/catalog';
import { DEFAULT_CURRENCY } from '../lib/value';
import { AssessmentCriterion, PriorityThresholds, Service, ServiceRequest, Team as TeamDoc, User } from '../types';
import PriorityModelEditor from '../components/workspace/PriorityModelEditor';
import TargetsAndCostEditor from '../components/workspace/TargetsAndCostEditor';
import LinesOfBusinessEditor from '../components/workspace/LinesOfBusinessEditor';
import WorkingWeekEditor from '../components/workspace/WorkingWeekEditor';
import RemoveMemberDialog from '../components/workspace/RemoveMemberDialog';
import { useVisibleRequests } from '../hooks/useVisibleRequests';
import * as commands from '../services/requestCommands';
import { calendarOf, standardWeek, WorkCalendar } from '../lib/demand';
import { checkModel, newTeam, renameTeam } from '../services/teamService';

const inputClass = 'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

// A typed rate, or null for "use the team's rate"
const toRate = (value: string) => (value.trim() === '' ? null : Number(value));

type Tab = 'people' | 'lob' | 'priority' | 'targets';
const TABS: { key: Tab; label: string; help: string }[] = [
  { key: 'people', label: 'People & capacity', help: "The team's working week, who's on the team, how many hours a week each person has for demand, and their hourly rate (used to show effort as cost). Leave a rate blank to use the team's rate." },
  { key: 'lob', label: 'Lines of business', help: 'The lines of business your team takes demand from. Requesters pick one when they raise a request.' },
  { key: 'priority', label: 'Prioritization', help: 'How requests are scored when they are assessed. The weighted score (0–100) sets the priority; managers can override it with a reason.' },
  { key: 'targets', label: 'Targets & cost', help: 'Optional targets for responding to and delivering demand, and the hourly rate used to show effort as cost.' }
];

// Where managers run their team: people and capacity, lines of business, prioritization, and targets
const Team = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data: teams, loading, error, add: addTeam, update: updateTeam } = useFirestore<TeamDoc>({ collectionName: COLLECTIONS.TEAMS });
  const { data: users, update: updateUser } = useFirestore<User>({ collectionName: COLLECTIONS.USERS });
  const { data: services, update: updateService } = useFirestore<Service>({ collectionName: COLLECTIONS.SERVICES });
  // Members' ongoing work, so it can be handed over when someone leaves the team
  const { data: requests, update: updateRequest } = useVisibleRequests(user);

  const visibleTeams = useMemo(
    () => teams.filter(t => isAdmin || t.id === user?.teamId).sort((a, b) => a.name.localeCompare(b.name)),
    [teams, isAdmin, user?.teamId]
  );
  const [teamId, setTeamId] = useState('');
  const team = visibleTeams.find(t => t.id === teamId) ?? visibleTeams[0];
  const [tab, setTab] = useState<Tab>('people');

  const [draft, setDraft] = useState({ name: '', description: '' });
  const [capacity, setCapacity] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [rates, setRates] = useState<Record<string, string>>({}); // '' = use the team's rate
  const calendar = useMemo(() => calendarOf(team), [team]);
  // New members start with the team's standard week
  const [adding, setAdding] = useState({ userId: '', hours: DEFAULT_WEEKLY_CAPACITY, rate: '' });
  useEffect(() => setAdding(a => ({ ...a, hours: standardWeek(calendar) })), [calendar]);
  const [removing, setRemoving] = useState<User | null>(null);

  const members = useMemo(() => (team ? users.filter(u => u.teamId === team.id).sort((a, b) => a.displayName.localeCompare(b.displayName)) : []), [users, team]);
  useEffect(() => {
    if (team) setDraft({ name: team.name, description: team.description ?? '' });
  }, [team]);
  useEffect(() => {
    setCapacity(Object.fromEntries(members.map(m => [m.id, m.weeklyCapacityHours ?? DEFAULT_WEEKLY_CAPACITY])));
    setRates(Object.fromEntries(members.map(m => [m.id, m.hourlyRate ? String(m.hourlyRate) : ''])));
  }, [members]);
  useEffect(() => setMessage(null), [tab, team?.id]);

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
  const run = async (action: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await action();
      setMessage({ tone: 'ok', text: ok });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save' });
    }
  };

  const saveDetails = () =>
    run(async () => {
      if (!team) return;
      if (draft.name.trim() !== team.name) {
        await renameTeam(team.name, draft.name, { teams, users, services, canCreate: isAdmin }, { updateTeam, addTeam, updateUser, updateService });
      }
      if ((team.description ?? '') !== draft.description) await updateTeam(team.id, { description: draft.description.trim() });
    }, 'Team details saved.');

  // Managers and admins change who is on the team; leads set their members' hours
  const canManageMembers = canEdit && (isAdmin || user?.role === 'manager');
  // Managers can add people who aren't on a team yet; admins can also move people from another team
  const addable = team
    ? users
        .filter(u => u.teamId !== team.id && (isAdmin || !u.teamId) && u.active !== false)
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
    : [];
  const addMember = () =>
    run(async () => {
      const person = addable.find(u => u.id === adding.userId);
      if (!person || !team) return;
      await updateUser(person.id, { teamId: team.id, team: team.name, weeklyCapacityHours: adding.hours, hourlyRate: toRate(adding.rate) });
      setAdding({ userId: '', hours: standardWeek(calendar), rate: '' });
    }, 'Added to the team.');
  // Hands the chosen work to teammates (same estimate, dates, and weekly split), then removes the person.
  // Errors show in the dialog, so this throws rather than using run()
  const removeMember = async (person: User, handover: { request: ServiceRequest; to: User }[]) => {
    if (!team || !user) return;
    const actor = { id: user.id, name: user.displayName };
    for (const { request, to } of handover) {
      const patch = commands.plan(
        request,
        {
          assignee: to,
          estimatedHours: request.estimatedHours,
          startDate: request.startDate,
          dueDate: request.dueDate,
          weeklyPlan: request.weeklyPlan ?? null,
          note: `${person.displayName} left the team`,
          commit: request.status !== 'planned'
        },
        actor
      );
      await updateRequest(request.id, patch);
    }
    if (team.managerIds?.includes(person.id)) await updateTeam(team.id, { managerIds: team.managerIds.filter(id => id !== person.id) });
    await updateUser(person.id, { teamId: '', team: '' });
    setRemoving(null);
    setMessage({
      tone: 'ok',
      text: `${person.displayName} was removed from the team${handover.length ? ` and ${handover.length} ${handover.length === 1 ? 'request was' : 'requests were'} reassigned` : ''}.`
    });
  };

  const saveWorkingWeek = (next: WorkCalendar, applyToMembers: boolean) =>
    run(async () => {
      if (!team) return;
      await updateTeam(team.id, { workingDays: next.workingDays, hoursPerDay: next.hoursPerDay });
      if (applyToMembers) await Promise.all(members.map(m => updateUser(m.id, { weeklyCapacityHours: standardWeek(next) })));
    }, applyToMembers ? "Working week saved and applied to every member's hours." : 'Working week saved.');

  const changedMembers = members.filter(
    m => (m.weeklyCapacityHours ?? DEFAULT_WEEKLY_CAPACITY) !== capacity[m.id] || (m.hourlyRate ?? null) !== toRate(rates[m.id] ?? '')
  );
  const invalidEntry =
    Object.values(capacity).some(h => !(h >= 0 && h <= 80)) || Object.values(rates).some(r => r !== '' && !(Number(r) >= 0));
  const saveMembers = () =>
    run(
      () => Promise.all(changedMembers.map(m => updateUser(m.id, { weeklyCapacityHours: capacity[m.id], hourlyRate: toRate(rates[m.id] ?? '') }))),
      'Changes saved.'
    );

  const toggleManager = (id: string) =>
    run(() => {
      const managerIds = team!.managerIds?.includes(id) ? team!.managerIds.filter(m => m !== id) : [...(team!.managerIds ?? []), id];
      return updateTeam(team!.id, { managerIds });
    }, 'Saved.');

  const saveModel = async (assessmentCriteria: AssessmentCriterion[], priorityThresholds: PriorityThresholds) => {
    checkModel({ assessmentCriteria, priorityThresholds });
    await updateTeam(team!.id, { assessmentCriteria, priorityThresholds });
  };

  const current = TABS.find(t => t.key === tab)!;

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
            <UsersIcon className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{team ? team.name : 'Team'}</h1>
            <p className="text-gray-500 text-sm">Manage your team's people, lines of business, and how demand is prioritized</p>
          </div>
        </div>
        {visibleTeams.length > 1 && (
          <select value={team?.id ?? ''} onChange={e => setTeamId(e.target.value)} className="rounded-lg border-gray-300" aria-label="Team">
            {visibleTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {error && <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600 border border-red-200">Error loading teams: {error.message}</div>}

      {!team ? (
        <div className="card p-8 max-w-md">
          {isAdmin ? (
            <form
              onSubmit={e => {
                e.preventDefault();
                run(() => addTeam(newTeam(newName)), 'Team created.');
              }}
              className="space-y-4"
            >
              <p className="text-gray-600">No team yet. Create the team that handles demand.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700">Team name</label>
                <input className={inputClass} value={newName} onChange={e => setNewName(e.target.value)} required />
              </div>
              <button type="submit" className="btn-primary">Create team</button>
              {message && <p className="text-sm text-red-600">{message.text}</p>}
            </form>
          ) : (
            <p className="text-gray-600">You're not a member of a team yet. Ask an admin to add you to one on the Users page.</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4" role="tablist">
            {TABS.map(t => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  tab === t.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <section className="card p-6">
            <p className="text-sm text-gray-500 mb-5">{current.help}</p>
            {!canEdit && <p className="mb-4 p-3 rounded-lg bg-gray-50 text-sm text-gray-600">Only this team's leads, managers, or an admin can make changes.</p>}
            {message && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-600'}`}>{message.text}</div>
            )}

            {tab === 'people' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Team name</label>
                    <input className={inputClass} value={draft.name} disabled={!canRename} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">What the team does</label>
                    <input className={inputClass} value={draft.description} disabled={!canEdit} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
                  </div>
                  {canEdit && (
                    <div>
                      <button
                        onClick={saveDetails}
                        disabled={draft.name.trim() === team.name && draft.description === (team.description ?? '')}
                        className="btn-primary disabled:opacity-50"
                      >
                        Save team details
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="text-base font-semibold">Working week</h2>
                  <p className="text-sm text-gray-500 mb-3">
                    Estimates are spread evenly over the working days between a request's start and due dates.
                  </p>
                  <WorkingWeekEditor key={team.id} value={calendar} readOnly={!canEdit} memberCount={members.length} onSave={saveWorkingWeek} />
                </div>

                <div>
                  <h2 className="text-base font-semibold mb-2">Members ({members.length})</h2>
                  {members.length === 0 ? (
                    <p className="text-sm text-gray-500">No members yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <th className="px-4 py-2 text-left">Name</th>
                            <th className="px-4 py-2 text-left">Role</th>
                            <th className="px-4 py-2 text-left">Hours / week</th>
                            <th className="px-4 py-2 text-left">Hourly rate ({team.currency || DEFAULT_CURRENCY})</th>
                            <th className="px-4 py-2 text-left">Manages the team</th>
                            {canManageMembers && <th className="px-4 py-2" />}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {members.map(m => {
                            const role = normalizeRole(m.role);
                            const canManage = role === 'lead' || role === 'manager' || role === 'admin';
                            return (
                              <tr key={m.id}>
                                <td className="px-4 py-2 font-medium">{m.displayName}</td>
                                <td className="px-4 py-2 text-gray-600">{ROLE_LABELS[role]}</td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    max={80}
                                    value={capacity[m.id] ?? DEFAULT_WEEKLY_CAPACITY}
                                    disabled={!canEdit}
                                    onChange={e => setCapacity(c => ({ ...c, [m.id]: Number(e.target.value) }))}
                                    className="w-24 rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                                    aria-label={`${m.displayName} weekly hours`}
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={rates[m.id] ?? ''}
                                    disabled={!canEdit}
                                    placeholder={team.hourlyRate ? `Team: ${team.hourlyRate}` : 'Not set'}
                                    onChange={e => setRates(r => ({ ...r, [m.id]: e.target.value }))}
                                    className="w-28 rounded-md border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                                    aria-label={`${m.displayName} hourly rate`}
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  {canManage ? (
                                    <input type="checkbox" checked={!!team.managerIds?.includes(m.id)} disabled={!canEdit} onChange={() => toggleManager(m.id)} className="rounded" aria-label={`${m.displayName} manages the team`} />
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                                {canManageMembers && (
                                  <td className="px-4 py-2 text-right">
                                      <button
                                        onClick={() => setRemoving(m)}
                                        disabled={m.id === user?.id}
                                        title={m.id === user?.id ? "You can't remove yourself" : `Remove ${m.displayName} from the team`}
                                        className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                        aria-label={`Remove ${m.displayName} from the team`}
                                      >
                                        <UserMinus size={16} />
                                      </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {canEdit && members.length > 0 && (
                    <button
                      onClick={saveMembers}
                      disabled={changedMembers.length === 0 || invalidEntry}
                      className="mt-3 btn-primary disabled:opacity-50"
                    >
                      Save changes
                    </button>
                  )}

                  {canManageMembers && (
                    <div className="mt-6 p-4 rounded-lg border border-gray-200 bg-gray-50">
                      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><UserPlus size={16} /> Add a member</h3>
                      {addable.length === 0 ? (
                        <p className="mt-1 text-sm text-gray-500">
                          Everyone is already on a team. New people appear here once they have an account (admins create accounts on the Users page).
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap items-end gap-3">
                          <label className="text-xs text-gray-600">
                            Person
                            <select
                              value={adding.userId}
                              onChange={e => setAdding(a => ({ ...a, userId: e.target.value }))}
                              className="mt-1 block w-64 rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                              <option value="">Select a person</option>
                              {addable.map(u => (
                                <option key={u.id} value={u.id}>
                                  {u.displayName}{u.email ? ` (${u.email})` : ''}{u.teamId ? ` · now in ${u.team || 'another team'}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-gray-600">
                            Hours / week
                            <input
                              type="number"
                              min={0}
                              max={80}
                              value={adding.hours}
                              onChange={e => setAdding(a => ({ ...a, hours: Number(e.target.value) }))}
                              className="mt-1 block w-24 rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                          </label>
                          <label className="text-xs text-gray-600">
                            Hourly rate (optional)
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={adding.rate}
                              placeholder={team.hourlyRate ? `Team: ${team.hourlyRate}` : 'Not set'}
                              onChange={e => setAdding(a => ({ ...a, rate: e.target.value }))}
                              className="mt-1 block w-28 rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                          </label>
                          <button onClick={addMember} disabled={!adding.userId || !(adding.hours >= 0 && adding.hours <= 80)} className="btn-primary disabled:opacity-50">
                            Add to team
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'lob' && (
              <LinesOfBusinessEditor
                key={team.id}
                value={linesOfBusinessOf(team)}
                suggestions={[]}
                readOnly={!canEdit}
                onSave={lobs => updateTeam(team.id, { linesOfBusiness: lobs }).then(() => undefined)}
              />
            )}

            {tab === 'priority' && (
              <PriorityModelEditor key={team.id} criteria={teamModel(team).criteria} thresholds={teamModel(team).thresholds} readOnly={!canEdit} onSave={saveModel} />
            )}

            {tab === 'targets' && (
              <TargetsAndCostEditor key={team.id} team={team} readOnly={!canEdit} onSave={data => updateTeam(team.id, data).then(() => undefined)} />
            )}
          </section>
        </>
      )}

      {removing && team && (
        <RemoveMemberDialog
          person={removing}
          teammates={members.filter(m => m.id !== removing.id && m.active !== false)}
          requests={requests}
          calendar={calendar}
          onConfirm={handover => removeMember(removing, handover)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
};

export default Team;
