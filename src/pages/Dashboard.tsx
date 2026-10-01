import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Inbox, ListTodo, AlarmClock, CheckCircle2, Timer, Target, Gauge, ClipboardList, AlertTriangle } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { useVisibleRequests } from '../hooks/useVisibleRequests';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { canManageRequests, usersInScope } from '../lib/roles';
import {
  addDays,
  buildCapacity,
  loggedByUserWeek,
  summarizeTeams,
  firestoreDate,
  formatWeek,
  isOpen,
  isOverdue,
  formatHours,
  INTAKE_STATUSES,
  OPEN_STATUSES,
  PRIORITIES,
  priorityRank,
  startOfWeek,
  STATUS_STYLES,
  toDateKey,
  utilization,
  weekKeys
} from '../lib/demand';
import { PRIORITY_STYLES } from '../lib/priority';
import { ServiceRequest, User } from '../types';
import DashboardCard from '../components/DashboardCard';
import DonutChart from '../components/charts/DonutChart';
import ColumnChart from '../components/charts/ColumnChart';
import BarChart from '../components/charts/BarChart';
import { NEUTRAL, PRIORITY_RAMP, SERIES, STATUS } from '../components/charts/chartTheme';
import TeamConsumptionTable from '../components/capacity/TeamConsumptionTable';
import { PriorityBadge, StatusBadge } from '../components/RequestBadges';

const DAY = 86400000;

const Panel = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <div className="card p-6">
    <h2 className="text-lg font-semibold">{title}</h2>
    {subtitle && <p className="text-sm text-gray-500 mb-4">{subtitle}</p>}
    <div className={subtitle ? '' : 'mt-4'}>{children}</div>
  </div>
);

// Fixed colour per open status (colour follows the status, never its rank)
const STATUS_COLORS: Record<string, string> = {
  new: SERIES[0],
  assessing: SERIES[1],
  approved: SERIES[2],
  planned: SERIES[3],
  committed: SERIES[4],
  'in-progress': SERIES[5],
  blocked: SERIES[6]
};

// Up to 7 categories get their own colour (in catalog order); the rest fold into "Other"
const MAX_CATEGORY_SLOTS = 7;

const RequestList = ({ requests, empty }: { requests: ServiceRequest[]; empty: string }) =>
  requests.length === 0 ? (
    <p className="text-sm text-gray-500">{empty}</p>
  ) : (
    <div className="space-y-3">
      {requests.map(r => (
        <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50">
          <div className="min-w-0">
            <p className="font-medium truncate">{r.title}</p>
            <p className="text-xs text-gray-500">
              {r.requestNumber} · {r.serviceName}
              {r.dueDate && <span className={isOverdue(r) ? 'text-red-600 font-medium' : ''}> · due {r.dueDate}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PriorityBadge priority={r.priority} />
            <StatusBadge status={r.status} />
          </div>
        </div>
      ))}
    </div>
  );

const Dashboard = () => {
  const { user } = useAuth();
  const isManager = canManageRequests(user?.role);
  const navigate = useNavigate();
  const [consumptionView, setConsumptionView] = useState<'planned' | 'logged'>('planned');

  const { data: requests, loading: requestsLoading } = useVisibleRequests(user);
  const { data: allUsers, loading: usersLoading } = useFirestore<User>({ collectionName: COLLECTIONS.USERS });
  // Leads and managers see their own team's capacity; admins see everyone
  const users = useMemo(() => usersInScope(allUsers, user), [allUsers, user]);
  const { data: categoryDocs } = useFirestore<{ name: string }>({ collectionName: COLLECTIONS.CATEGORIES });

  const stats = useMemo(() => {
    const now = new Date();
    const open = requests.filter(isOpen);
    const completed = requests.filter(r => r.status === 'completed');
    const since = (days: number) => now.getTime() - days * DAY;

    const completedRecent = completed.filter(r => (firestoreDate(r.completedAt)?.getTime() ?? 0) >= since(90));
    const withDue = completedRecent.filter(r => r.dueDate);
    const onTime = withDue.filter(r => toDateKey(firestoreDate(r.completedAt)!) <= r.dueDate);
    const leadTimes = completedRecent
      .map(r => {
        const created = firestoreDate(r.createdAt);
        const done = firestoreDate(r.completedAt);
        return created && done ? (done.getTime() - created.getTime()) / DAY : null;
      })
      .filter((d): d is number => d !== null);

    // New vs completed per week, last 8 weeks
    const weeks = weekKeys(addDays(startOfWeek(now), -7 * 7), 8);
    const weekOf = (d: Date | null) => (d ? toDateKey(startOfWeek(d)) : '');
    const createdPerWeek = weeks.map(w => requests.filter(r => weekOf(firestoreDate(r.createdAt)) === w).length);
    const completedPerWeek = weeks.map(w => completed.filter(r => weekOf(firestoreDate(r.completedAt)) === w).length);

    // Demand by service and by category, last 90 days
    const recent = requests.filter(r => (firestoreDate(r.createdAt)?.getTime() ?? 0) >= since(90));
    const byService = new Map<string, number>();
    for (const r of recent) byService.set(r.serviceName, (byService.get(r.serviceName) || 0) + 1);

    const coloured = categoryDocs.map(c => c.name).sort().slice(0, MAX_CATEGORY_SLOTS);
    const byCategory = coloured.map((name, i) => ({
      key: name,
      label: name,
      value: recent.filter(r => r.category === name).length,
      color: SERIES[i]
    }));
    const otherCount = recent.filter(r => !coloured.includes(r.category)).length;
    if (otherCount) byCategory.push({ key: '__other', label: 'Other', value: otherCount, color: NEUTRAL });

    const consumptionWeeks = weekKeys(addDays(startOfWeek(now), -21), 8);

    // Team utilization this week (planned)
    const thisWeek = weekKeys(now, 1);
    const capacityRows = buildCapacity(users, requests, thisWeek);
    const teamLoad = new Map<string, { planned: number; capacity: number }>();
    for (const row of capacityRows) {
      const t = teamLoad.get(row.team) || { planned: 0, capacity: 0 };
      t.planned += row.allocated[thisWeek[0]];
      t.capacity += row.weeklyCapacity;
      teamLoad.set(row.team, t);
    }
    const totalPlanned = [...teamLoad.values()].reduce((s, t) => s + t.planned, 0);
    const totalCapacity = [...teamLoad.values()].reduce((s, t) => s + t.capacity, 0);

    return {
      open,
      triage: requests.filter(r => INTAKE_STATUSES.includes(r.status)),
      overdue: open.filter(r => isOverdue(r)),
      completed30: completed.filter(r => (firestoreDate(r.completedAt)?.getTime() ?? 0) >= since(30)).length,
      onTimePct: withDue.length ? Math.round((onTime.length / withDue.length) * 100) : null,
      avgLeadDays: leadTimes.length ? Math.round((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) * 10) / 10 : null,
      weeks,
      createdPerWeek,
      completedPerWeek,
      byService: [...byService.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      byCategory,
      teamLoad: [...teamLoad.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      utilizationPct: utilization(totalPlanned, totalCapacity),
      // Team consumption: 3 weeks back, this week, and 4 weeks ahead
      consumptionWeeks,
      teamConsumption: summarizeTeams(buildCapacity(users, requests, consumptionWeeks), consumptionWeeks, loggedByUserWeek(requests))
    };
  }, [requests, users, categoryDocs]);

  if (requestsLoading || usersLoading || !user) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const myRequests = requests.filter(r => r.requesterId === user.id);
  const myWork = requests.filter(r => r.assigneeId === user.id && isOpen(r));
  const byPriority = (a: ServiceRequest, b: ServiceRequest) => priorityRank(a.priority) - priorityRank(b.priority);

  const personal = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
      <Panel title="My open requests" subtitle="Requests you've raised">
        <RequestList requests={myRequests.filter(isOpen).sort(byPriority).slice(0, 6)} empty="You have no open requests." />
        <Link to="/requests" className="inline-block mt-4 text-sm font-medium text-blue-600 hover:text-blue-700">View all requests →</Link>
      </Panel>
      <Panel title="My work" subtitle="Requests assigned to you">
        <RequestList requests={myWork.sort(byPriority).slice(0, 6)} empty="Nothing is assigned to you." />
      </Panel>
    </div>
  );

  if (!isManager) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <DashboardCard title="My open requests" value={myRequests.filter(isOpen).length} icon={ClipboardList} color="bg-blue-600" />
          <DashboardCard title="Assigned to me" value={myWork.length} icon={ListTodo} color="bg-cyan-600" />
          <DashboardCard title="My overdue work" value={myWork.filter(r => isOverdue(r)).length} icon={AlarmClock} color="bg-red-600" />
        </div>
        {personal}
      </div>
    );
  }

  const statusData = OPEN_STATUSES.map(s => ({
    key: s,
    label: STATUS_STYLES[s].label,
    value: stats.open.filter(r => r.status === s).length,
    color: STATUS_COLORS[s]
  }));

  const priorityCounts = [
    ...PRIORITIES.map(p => stats.open.filter(r => r.priority === p).length),
    stats.open.filter(r => !r.priority).length
  ];

  const attention = [...stats.overdue, ...stats.open.filter(r => r.priority === 'critical' && !isOverdue(r))]
    .sort(byPriority)
    .slice(0, 6);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Demand Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard title="Open requests" value={stats.open.length} icon={Inbox} color="bg-blue-600" />
        <DashboardCard title="Awaiting assessment" value={stats.triage.length} icon={ListTodo} color="bg-purple-600" />
        <DashboardCard title="Overdue" value={stats.overdue.length} icon={AlarmClock} color="bg-red-600" />
        <DashboardCard title="Completed (30 days)" value={stats.completed30} icon={CheckCircle2} color="bg-emerald-600" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 text-gray-600 text-sm font-medium"><Target size={16} /> Delivered on time (90 days)</div>
          <p className="text-3xl font-bold mt-1">{stats.onTimePct === null ? '—' : `${stats.onTimePct}%`}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 text-gray-600 text-sm font-medium"><Timer size={16} /> Avg. lead time (90 days)</div>
          <p className="text-3xl font-bold mt-1">{stats.avgLeadDays === null ? '—' : `${stats.avgLeadDays} days`}</p>
        </div>
        <Link to="/capacity" className="stat-card block">
          <div className="flex items-center gap-2 text-gray-600 text-sm font-medium"><Gauge size={16} /> Planned utilization this week</div>
          <p className="text-3xl font-bold mt-1">{stats.utilizationPct}%</p>
        </Link>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="p-6 pb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Team consumption by week</h2>
            <p className="text-sm text-gray-500">
              {consumptionView === 'planned' ? 'Planned hours' : 'Logged hours'} as a share of each team's combined capacity ·
              last 3 weeks, this week, and the next 4
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100" /> under 80%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100" /> 80–100%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100" /> over 100%</span>
            </div>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              {(['planned', 'logged'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setConsumptionView(v)}
                  className={`px-3 py-1.5 font-medium ${consumptionView === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  {v === 'planned' ? 'Planned' : 'Actual (logged)'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <TeamConsumptionTable
          summaries={stats.teamConsumption}
          weeks={stats.consumptionWeeks}
          view={consumptionView}
          thisWeek={toDateKey(startOfWeek(new Date()))}
          onSelectTeam={team => navigate('/capacity', { state: { openTeam: team } })}
        />
        <p className="px-6 py-3 text-xs text-gray-500 border-t border-gray-100">
          Click a team to see its members, requests, and weekly detail on the Capacity page.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <Panel title="Open requests by status" subtitle="Where open work currently sits">
          <DonutChart data={statusData} centerLabel="open" emptyText="No open requests." />
        </Panel>
        <Panel title="Demand by category" subtitle="Requests raised in the last 90 days">
          <DonutChart data={stats.byCategory} centerLabel="requests" emptyText="No requests in the last 90 days." />
        </Panel>
        <Panel title="Open backlog by priority" subtitle="Darker is more urgent">
          <ColumnChart
            categories={[...PRIORITIES.map(p => PRIORITY_STYLES[p].label), 'Not assessed']}
            series={[{
              key: 'open',
              label: 'Open requests',
              values: priorityCounts,
              color: PRIORITY_RAMP.high,
              colors: [PRIORITY_RAMP.critical, PRIORITY_RAMP.high, PRIORITY_RAMP.medium, PRIORITY_RAMP.low, NEUTRAL]
            }]}
            height={170}
            showValues
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2">
          <Panel title="Demand trend" subtitle="New and completed requests per week, last 8 weeks">
            <ColumnChart
              categories={stats.weeks.map(formatWeek)}
              series={[
                { key: 'new', label: 'New', values: stats.createdPerWeek, color: SERIES[0] },
                { key: 'completed', label: 'Completed', values: stats.completedPerWeek, color: SERIES[1] }
              ]}
              height={200}
            />
          </Panel>
        </div>
        <Panel title="Team utilization this week" subtitle="Planned hours as a share of capacity">
          <BarChart
            data={stats.teamLoad.map(([team, t]) => {
              const pct = utilization(t.planned, t.capacity);
              const over = pct > 100;
              return {
                key: team,
                label: team,
                value: pct,
                valueLabel: `${pct}%`,
                color: over ? STATUS.critical : pct >= 80 ? STATUS.warning : STATUS.good,
                badge: over ? <AlertTriangle size={14} className="text-red-600" aria-label="Over capacity" /> : undefined,
                tooltip: <div className="text-gray-500 mt-1">{formatHours(t.planned)} planned of {formatHours(t.capacity)}</div>
              };
            })}
            reference={{ value: 100, label: '100%' }}
            emptyText="No users yet."
          />
          <div className="flex flex-wrap gap-3 mt-4 text-xs text-gray-600">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: STATUS.good }} /> Under 80%</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: STATUS.warning }} /> 80–100%</span>
            <span className="flex items-center gap-1.5"><AlertTriangle size={12} className="text-red-600" /> Over capacity</span>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <Panel title="Most requested services" subtitle="Last 90 days">
          <BarChart
            data={stats.byService.map(([label, value]) => ({ key: label, label, value, color: SERIES[0] }))}
            emptyText="No requests in the last 90 days."
          />
        </Panel>
        <Panel title="Needs attention" subtitle="Overdue and open critical demand">
          <RequestList requests={attention} empty="Nothing overdue or critical." />
        </Panel>
        <Panel title="Awaiting assessment" subtitle="Oldest first">
          <RequestList
            requests={[...stats.triage].sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0)).slice(0, 6)}
            empty="Nothing is waiting for assessment."
          />
          <Link to="/requests" className="inline-block mt-4 text-sm font-medium text-blue-600 hover:text-blue-700">Go to requests →</Link>
        </Panel>
      </div>

      {personal}
    </div>
  );
};

export default Dashboard;
