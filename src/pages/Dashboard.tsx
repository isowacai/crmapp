import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, ListTodo, AlarmClock, CheckCircle2, Timer, Target, Gauge, ClipboardList } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { canManageRequests } from '../lib/roles';
import {
  addDays,
  buildCapacity,
  firestoreDate,
  formatWeek,
  isOpen,
  isOverdue,
  OPEN_STATUSES,
  PRIORITIES,
  PRIORITY_STYLES,
  startOfWeek,
  STATUS_STYLES,
  toDateKey,
  utilization,
  weekKeys
} from '../lib/demand';
import { ServiceRequest, User } from '../types';
import DashboardCard from '../components/DashboardCard';
import PieChart from '../components/PieChart';
import BarList from '../components/BarList';
import { PriorityBadge, StatusBadge } from '../components/RequestBadges';

const DAY = 86400000;

const Panel = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <div className="card p-6">
    <h2 className="text-lg font-semibold">{title}</h2>
    {subtitle && <p className="text-sm text-gray-500 mb-4">{subtitle}</p>}
    <div className={subtitle ? '' : 'mt-4'}>{children}</div>
  </div>
);

// Two-series weekly column chart (created vs completed)
const WeeklyColumns = ({ weeks, created, completed }: { weeks: string[]; created: number[]; completed: number[] }) => {
  const max = Math.max(...created, ...completed, 1);
  return (
    <div>
      <div className="flex items-end gap-2 h-40">
        {weeks.map((w, i) => (
          <div key={w} className="flex-1 flex items-end justify-center gap-0.5 h-full" title={`${formatWeek(w)}: ${created[i]} new, ${completed[i]} completed`}>
            <div className="w-1/2 max-w-4 bg-blue-500 rounded-t" style={{ height: `${(created[i] / max) * 100}%` }} />
            <div className="w-1/2 max-w-4 bg-emerald-500 rounded-t" style={{ height: `${(completed[i] / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        {weeks.map(w => (
          <div key={w} className="flex-1 text-center text-[10px] text-gray-500">{formatWeek(w)}</div>
        ))}
      </div>
      <div className="flex gap-4 mt-3 text-xs text-gray-600">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500" /> New</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> Completed</span>
      </div>
    </div>
  );
};

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

  const { data: requests, loading: requestsLoading } = useFirestore<ServiceRequest>({ collectionName: COLLECTIONS.REQUESTS });
  const { data: users, loading: usersLoading } = useFirestore<User>({ collectionName: COLLECTIONS.USERS });

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

    // Demand by service, last 90 days
    const byService = new Map<string, number>();
    for (const r of requests) {
      if ((firestoreDate(r.createdAt)?.getTime() ?? 0) >= since(90)) {
        byService.set(r.serviceName, (byService.get(r.serviceName) || 0) + 1);
      }
    }

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
      triage: requests.filter(r => r.status === 'submitted'),
      overdue: open.filter(r => isOverdue(r)),
      completed30: completed.filter(r => (firestoreDate(r.completedAt)?.getTime() ?? 0) >= since(30)).length,
      onTimePct: withDue.length ? Math.round((onTime.length / withDue.length) * 100) : null,
      avgLeadDays: leadTimes.length ? Math.round((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) * 10) / 10 : null,
      weeks,
      createdPerWeek,
      completedPerWeek,
      byService: [...byService.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      teamLoad: [...teamLoad.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      utilizationPct: utilization(totalPlanned, totalCapacity)
    };
  }, [requests, users]);

  if (requestsLoading || usersLoading || !user) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const myRequests = requests.filter(r => r.requesterId === user.id);
  const myWork = requests.filter(r => r.assigneeId === user.id && isOpen(r));
  const byPriority = (a: ServiceRequest, b: ServiceRequest) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);

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
    label: STATUS_STYLES[s].label,
    value: stats.open.filter(r => r.status === s).length,
    color: STATUS_STYLES[s].color
  })).filter(d => d.value > 0);

  const attention = [...stats.overdue, ...stats.open.filter(r => r.priority === 'P1' && !isOverdue(r))]
    .sort(byPriority)
    .slice(0, 6);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Demand Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard title="Open requests" value={stats.open.length} icon={Inbox} color="bg-blue-600" />
        <DashboardCard title="Awaiting triage" value={stats.triage.length} icon={ListTodo} color="bg-purple-600" />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <Panel title="Open requests by status">
          {statusData.length ? (
            <div className="flex justify-center"><PieChart data={statusData} size={160} title="" /></div>
          ) : (
            <p className="text-sm text-gray-500">No open requests.</p>
          )}
        </Panel>
        <Panel title="Open backlog by priority">
          <BarList
            items={PRIORITIES.map(p => ({
              label: PRIORITY_STYLES[p].label,
              value: stats.open.filter(r => r.priority === p).length,
              color: PRIORITY_STYLES[p].color
            }))}
          />
        </Panel>
        <Panel title="Team utilization this week" subtitle="Planned hours ÷ capacity">
          <BarList
            items={stats.teamLoad.map(([team, t]) => {
              const pct = utilization(t.planned, t.capacity);
              return { label: team, value: pct, suffix: '%', color: pct > 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#059669' };
            })}
            max={Math.max(100, ...stats.teamLoad.map(([, t]) => utilization(t.planned, t.capacity)))}
            emptyText="No users yet."
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Panel title="Demand trend" subtitle="New and completed requests per week">
          <WeeklyColumns weeks={stats.weeks} created={stats.createdPerWeek} completed={stats.completedPerWeek} />
        </Panel>
        <Panel title="Most requested services" subtitle="Last 90 days">
          <BarList items={stats.byService.map(([label, value]) => ({ label, value }))} emptyText="No requests in the last 90 days." />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Panel title="Needs attention" subtitle="Overdue and open P1 requests">
          <RequestList requests={attention} empty="Nothing overdue or critical." />
        </Panel>
        <Panel title="Awaiting triage" subtitle="Oldest first">
          <RequestList
            requests={[...stats.triage].sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0)).slice(0, 6)}
            empty="The triage queue is empty."
          />
          <Link to="/requests" className="inline-block mt-4 text-sm font-medium text-blue-600 hover:text-blue-700">Go to requests →</Link>
        </Panel>
      </div>

      {personal}
    </div>
  );
};

export default Dashboard;
