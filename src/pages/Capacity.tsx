import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Gauge, ChevronLeft, ChevronRight, AlertTriangle, Pencil } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { canManageCatalog, canManageRequests } from '../lib/roles';
import {
  addDays,
  buildCapacity,
  CapacityRow,
  formatHours,
  formatWeek,
  loggedByUserWeek,
  summarizeTeams,
  startOfWeek,
  toDateKey,
  UNASSIGNED_TEAM,
  utilization,
  utilizationClass,
  weekKeys
} from '../lib/demand';
import { Service, ServiceRequest, User } from '../types';
import Modal from '../components/Modal';
import PersonCapacity from '../components/capacity/PersonCapacity';
import RenameTeamForm from '../components/capacity/RenameTeamForm';
import TeamCapacity from '../components/capacity/TeamCapacity';
import TeamConsumptionTable from '../components/capacity/TeamConsumptionTable';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const Capacity = () => {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekCount, setWeekCount] = useState(8);
  const [teamFilter, setTeamFilter] = useState('all');
  const [view, setView] = useState<'planned' | 'logged'>('planned');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [renamingTeam, setRenamingTeam] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const canRenameTeams = canManageCatalog(user?.role);
  const location = useLocation();
  const navigate = useNavigate();

  // The dashboard links here with a team to open
  useEffect(() => {
    const team = (location.state as { openTeam?: string } | null)?.openTeam;
    if (team) {
      setSelectedTeam(team);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const { data: users, loading: usersLoading, update: updateUser } = useFirestore<User>({ collectionName: COLLECTIONS.USERS });
  const { data: requests, loading: requestsLoading } = useFirestore<ServiceRequest>({ collectionName: COLLECTIONS.REQUESTS });
  const { data: services, update: updateService } = useFirestore<Service>({ collectionName: COLLECTIONS.SERVICES });

  const weeks = useMemo(
    () => weekKeys(addDays(startOfWeek(new Date()), weekOffset * 7), weekCount),
    [weekOffset, weekCount]
  );
  const thisWeek = toDateKey(startOfWeek(new Date()));

  const rows = useMemo(() => buildCapacity(users, requests, weeks), [users, requests, weeks]);
  const logged = useMemo(() => loggedByUserWeek(requests), [requests]);

  const teams = [...new Set(rows.map(r => r.team))].sort();
  const visibleRows = rows.filter(r => teamFilter === 'all' || r.team === teamFilter);
  const selectedRow = rows.find(r => r.userId === selectedUserId) || null;

  // Everyone in a team (including inactive users); "Unassigned" means no team set
  const teamMembers = (team: string) => users.filter(u => (u.team || UNASSIGNED_TEAM) === team);
  const teamServices = (team: string) => (team === UNASSIGNED_TEAM ? [] : services.filter(s => s.ownerTeam === team));

  const handleRenameTeam = async (oldName: string, newName: string) => {
    await Promise.all([
      ...teamMembers(oldName).map(u => updateUser(u.id, { team: newName })),
      ...teamServices(oldName).map(s => updateService(s.id, { ownerTeam: newName }))
    ]);
    if (teamFilter === oldName) setTeamFilter(newName);
    setRenamingTeam(null);
  };

  const loggedFor = (row: CapacityRow, week: string) => logged.get(row.userId)?.get(week) || 0;
  const cellHours = (row: CapacityRow, week: string) => (view === 'planned' ? row.allocated[week] : loggedFor(row, week));

  const teamSummaries = summarizeTeams(rows, weeks, logged).filter(t => teamFilter === 'all' || t.team === teamFilter);

  const totals = {
    capacity: sum(teamSummaries.flatMap(t => weeks.map(w => t.capacity[w]))),
    planned: sum(teamSummaries.flatMap(t => weeks.map(w => t.planned[w]))),
    logged: sum(teamSummaries.flatMap(t => weeks.map(w => t.logged[w])))
  };
  const overbooked = visibleRows.filter(r => weeks.some(w => r.allocated[w] > r.weeklyCapacity));

  if (!canManageRequests(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (usersLoading || requestsLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const Cell = ({ hours, capacity, isCurrent }: { hours: number; capacity: number; isCurrent: boolean }) => {
    const pct = utilization(hours, capacity);
    return (
      <td className={`px-2 py-2 text-center ${isCurrent ? 'border-x-2 border-blue-200' : ''}`}>
        <div className={`rounded-md px-2 py-1.5 text-xs font-medium tabular-nums ${utilizationClass(pct)}`} title={`${formatHours(hours)} of ${formatHours(capacity)}`}>
          <div>{pct}%</div>
          <div className="font-normal opacity-75">{formatHours(hours)}</div>
        </div>
      </td>
    );
  };

  const WeekHeaders = () => (
    <>
      {weeks.map(w => (
        <th key={w} className={`px-2 py-3 text-center font-medium whitespace-nowrap ${w === thisWeek ? 'text-blue-700' : ''}`}>
          {formatWeek(w)}
        </th>
      ))}
    </>
  );

  return (
    <div className="p-8">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
            <Gauge className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Capacity</h1>
            <p className="text-gray-500 text-sm">Planned and actual load against each person's weekly capacity</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
            {(['planned', 'logged'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-2 text-sm font-medium ${view === v ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {v === 'planned' ? 'Planned' : 'Actual (logged)'}
              </button>
            ))}
          </div>
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="rounded-lg border-gray-300 text-sm">
            <option value="all">All teams</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={weekCount} onChange={e => setWeekCount(Number(e.target.value))} className="rounded-lg border-gray-300 text-sm">
            <option value={4}>4 weeks</option>
            <option value={8}>8 weeks</option>
            <option value={12}>12 weeks</option>
          </select>
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekOffset(o => o - weekCount)} className="btn-icon border border-gray-200 bg-white" aria-label="Earlier weeks">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => setWeekOffset(0)} className="px-3 py-2 text-sm font-medium border border-gray-200 bg-white rounded-lg hover:bg-gray-50">
              This week
            </button>
            <button onClick={() => setWeekOffset(o => o + weekCount)} className="btn-icon border border-gray-200 bg-white" aria-label="Later weeks">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="stat-card">
          <p className="text-gray-600 text-sm font-medium">Capacity in period</p>
          <p className="text-3xl font-bold mt-1">{formatHours(totals.capacity)}</p>
        </div>
        <div className="stat-card">
          <p className="text-gray-600 text-sm font-medium">Planned consumption</p>
          <p className="text-3xl font-bold mt-1">{utilization(totals.planned, totals.capacity)}%</p>
          <p className="text-sm text-gray-500">{formatHours(totals.planned)} planned</p>
        </div>
        <div className="stat-card">
          <p className="text-gray-600 text-sm font-medium">Actual consumption</p>
          <p className="text-3xl font-bold mt-1">{utilization(totals.logged, totals.capacity)}%</p>
          <p className="text-sm text-gray-500">{formatHours(totals.logged)} logged</p>
        </div>
        <div className="stat-card">
          <p className="text-gray-600 text-sm font-medium">People over capacity</p>
          <p className={`text-3xl font-bold mt-1 ${overbooked.length ? 'text-red-600' : ''}`}>{overbooked.length}</p>
          <p className="text-sm text-gray-500">in at least one week</p>
        </div>
      </div>

      {overbooked.length > 0 && view === 'planned' && (
        <div className="mb-6 flex gap-2 p-4 rounded-lg bg-red-50 text-red-700 text-sm">
          <AlertTriangle size={18} className="shrink-0" />
          Over capacity: {overbooked.map(r => r.name).join(', ')}. Reassign or re-plan their requests from Service Requests.
        </div>
      )}

      <div className="card mb-8 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold">Team consumption</h2>
          <p className="text-sm text-gray-500">
            {view === 'planned' ? 'Planned hours' : 'Logged hours'} as a share of the team's combined weekly capacity
          </p>
        </div>
        <TeamConsumptionTable
          summaries={teamSummaries}
          weeks={weeks}
          view={view}
          thisWeek={thisWeek}
          onSelectTeam={setSelectedTeam}
          teamActions={team =>
            canRenameTeams && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setRenamingTeam(team); }}
                className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                title={team === UNASSIGNED_TEAM ? 'Give these people a team' : 'Rename team'}
                aria-label={`Rename ${team}`}
              >
                <Pencil size={13} />
              </button>
            )
          }
        />
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-wrap justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">People</h2>
            <p className="text-sm text-gray-500">
              {view === 'planned'
                ? 'Estimated hours of assigned and in-progress requests, spread over their planned dates'
                : 'Hours logged on requests'}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100" /> under 80%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100" /> 80–100%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100" /> over 100%</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Person</th>
                <th className="px-4 py-3 text-right font-medium">Capacity / wk</th>
                <WeekHeaders />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRows.length === 0 ? (
                <tr><td colSpan={weeks.length + 2} className="px-4 py-8 text-center text-gray-500">No active users.</td></tr>
              ) : (
                visibleRows.map(row => (
                  <tr
                    key={row.userId}
                    onClick={() => setSelectedUserId(row.userId)}
                    className="cursor-pointer hover:bg-blue-50/50 transition-colors"
                    title="View assigned requests and consumption"
                  >
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setSelectedUserId(row.userId); }}
                        className="font-medium text-blue-700 hover:underline text-left"
                      >
                        {row.name}
                      </button>
                      <div className="text-xs text-gray-500">{row.team}</div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatHours(row.weeklyCapacity)}</td>
                    {weeks.map(w => <Cell key={w} hours={cellHours(row, w)} capacity={row.weeklyCapacity} isCurrent={w === thisWeek} />)}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {renamingTeam && (
        <Modal
          title={renamingTeam === UNASSIGNED_TEAM ? 'Assign a team' : `Rename ${renamingTeam}`}
          subtitle={renamingTeam === UNASSIGNED_TEAM ? 'Give everyone without a team a team name' : 'Updates every member of this team'}
          onClose={() => setRenamingTeam(null)}
          width="max-w-lg"
        >
          <RenameTeamForm
            team={renamingTeam}
            memberNames={teamMembers(renamingTeam).map(u => u.displayName || u.email || 'Unknown')}
            serviceCount={teamServices(renamingTeam).length}
            existingTeams={[...new Set([...users.map(u => u.team), ...services.map(s => s.ownerTeam)].filter(Boolean) as string[])].sort()}
            onSubmit={newName => handleRenameTeam(renamingTeam, newName)}
            onCancel={() => setRenamingTeam(null)}
          />
        </Modal>
      )}

      {selectedTeam && (
        <Modal
          title={selectedTeam}
          subtitle={`Team · ${formatWeek(weeks[0])} – ${formatWeek(weeks[weeks.length - 1])} (${weeks.length} weeks)`}
          onClose={() => setSelectedTeam(null)}
          width="max-w-6xl"
        >
          <TeamCapacity
            members={rows.filter(r => r.team === selectedTeam)}
            requests={requests}
            weeks={weeks}
            logged={logged}
            onSelectMember={setSelectedUserId}
          />
        </Modal>
      )}

      {/* Rendered after the team view so a person opened from it appears on top */}
      {selectedRow && (
        <Modal
          title={selectedRow.name}
          subtitle={`${selectedRow.team} · ${formatWeek(weeks[0])} – ${formatWeek(weeks[weeks.length - 1])} (${weeks.length} weeks)`}
          onClose={() => setSelectedUserId(null)}
          width="max-w-5xl"
        >
          <PersonCapacity
            row={selectedRow}
            requests={requests}
            weeks={weeks}
            loggedByWeek={logged.get(selectedRow.userId) || new Map()}
          />
        </Modal>
      )}
    </div>
  );
};

export default Capacity;
