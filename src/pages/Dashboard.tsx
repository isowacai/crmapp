import React, { useMemo, useState } from 'react';
import { useWorkCalendar } from '../hooks/useWorkCalendar';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, ListTodo, AlarmClock, AlertTriangle, Inbox, Gauge, CalendarRange, CheckCircle2, Timer, Target, Coins, Clock } from 'lucide-react';
import { DEFAULT_KPIS, KpiKey, kpisOf } from '../lib/workspace';
import { useFirestore } from '../hooks/useFirestore';
import { useVisibleRequests } from '../hooks/useVisibleRequests';
import { inViewerTeam } from '../lib/demandFilters';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { canManageRequests, usersInScope } from '../lib/roles';
import {
  addDays,
  buildCapacity,
  firestoreDate,
  formatHours,
  formatWeek,
  INTAKE_STATUSES,
  isOpen,
  isOverdue,
  loggedByUserWeek,
  OPEN_STATUSES,
  PRIORITIES,
  priorityRank,
  startOfWeek,
  STATUS_STYLES,
  summarizeTeams,
  toDateKey,
  utilization,
  weekKeys
} from '../lib/demand';
import { PRIORITY_STYLES } from '../lib/priority';
import { buildForecast, buildPeriods } from '../lib/forecast';
import { deliveryHealth } from '../lib/delivery';
import { averageStageDurations, STAGES, targetPerformance, waitingIn } from '../lib/lifecycle';
import { agingBuckets, completedSince, createdSince, highestPriorityUncommitted, upcomingCommitments } from '../lib/metrics';
import { costAvoidance, DEFAULT_CURRENCY, formatMoney, outcomeLabel, requestCost, sumOutcomes } from '../lib/value';
import { ServiceRequest, Team, User } from '../types';
import DashboardCard from '../components/DashboardCard';
import DonutChart from '../components/charts/DonutChart';
import ColumnChart from '../components/charts/ColumnChart';
import BarChart from '../components/charts/BarChart';
import PipelineSummary from '../components/demand/PipelineSummary';
import { NEUTRAL, PRIORITY_RAMP, SERIES, STATUS } from '../components/charts/chartTheme';
import TeamConsumptionTable from '../components/capacity/TeamConsumptionTable';
import Modal from '../components/Modal';
import { PriorityBadge, StatusBadge } from '../components/RequestBadges';

const DAY = 86400000;
const WINDOW_DAYS = 90; // performance and value look back this far

const Panel = ({
  title,
  subtitle,
  action,
  children
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 min-w-0">
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

// A headline figure; opens the requests behind it
const Kpi = ({
  label,
  value,
  sub,
  tone,
  icon: Icon,
  onClick
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'bad' | 'warn' | 'good';
  icon: typeof Inbox;
  onClick?: () => void;
}) => {
  const accent =
    tone === 'bad' ? 'text-red-600 bg-red-50' : tone === 'warn' ? 'text-amber-600 bg-amber-50' : tone === 'good' ? 'text-emerald-600 bg-emerald-50' : 'text-blue-600 bg-blue-50';
  const body = (
    <div className="flex items-start gap-3">
      <span className={`p-2 rounded-lg shrink-0 ${accent}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-semibold mt-0.5 ${tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900'}`}>{value}</p>
        {sub && <p className="text-xs text-gray-500 truncate" title={sub}>{sub}</p>}
      </div>
    </div>
  );
  const cls = 'bg-white rounded-xl border border-gray-200 p-4 text-left w-full';
  return onClick ? (
    <button onClick={onClick} className={`${cls} hover:border-blue-300 hover:shadow-sm transition`}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
};

// Small figure inside a report tab
const Figure = ({ label, value, sub, tone, onClick }: { label: string; value: string | number; sub?: string; tone?: 'bad' | 'warn'; onClick?: () => void }) => {
  const body = (
    <>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-semibold ${tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-left hover:border-blue-300">{body}</button>
  ) : (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">{body}</div>
  );
};

type ReportTab = 'demand' | 'priority' | 'capacity' | 'delivery' | 'performance' | 'value' | 'mine';

const REPORT_TABS: { key: ReportTab; label: string }[] = [
  { key: 'demand', label: 'Demand' },
  { key: 'priority', label: 'Priority' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'performance', label: 'Performance' },
  { key: 'value', label: 'Value' },
  { key: 'mine', label: 'My work' }
];

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

const RequestList = ({ requests, empty, onOpen }: { requests: ServiceRequest[]; empty: string; onOpen: (id: string) => void }) =>
  requests.length === 0 ? (
    <p className="text-sm text-gray-500">{empty}</p>
  ) : (
    <div className="divide-y divide-gray-100 -mx-2">
      {requests.map(r => (
        <button key={r.id} onClick={() => onOpen(r.id)} className="w-full flex items-center justify-between gap-3 px-2 py-2 rounded-md hover:bg-gray-50 text-left">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
            <p className="text-xs text-gray-500">
              {r.requestNumber} · {r.serviceName}
              {r.assigneeName && ` · ${r.assigneeName}`}
              {r.dueDate && <span className={isOverdue(r) ? 'text-red-600 font-medium' : ''}> · due {r.dueDate}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <PriorityBadge priority={r.priority} />
            <span className="hidden sm:inline"><StatusBadge status={r.status} /></span>
          </div>
        </button>
      ))}
    </div>
  );

const Dashboard = () => {
  const { user } = useAuth();
  const isManager = canManageRequests(user?.role);
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const [consumptionView, setConsumptionView] = useState<'planned' | 'logged'>('planned');
  const [drill, setDrill] = useState<{ title: string; items: ServiceRequest[] } | null>(null);
  const [report, setReportState] = useState<ReportTab>(() => {
    try {
      const saved = localStorage.getItem('dashboard.report') as ReportTab | null;
      return saved && REPORT_TABS.some(t => t.key === saved) ? saved : 'demand';
    } catch {
      return 'demand';
    }
  });
  const setReport = (t: ReportTab) => {
    setReportState(t);
    try {
      localStorage.setItem('dashboard.report', t);
    } catch {
      // Remembering the tab is optional
    }
  };

  const { data: requests, loading: requestsLoading } = useVisibleRequests(user);
  const { data: allUsers, loading: usersLoading } = useFirestore<User>({ collectionName: COLLECTIONS.USERS });
  // Leads and managers see their own team's capacity; admins see everyone
  const users = useMemo(() => usersInScope(allUsers, user), [allUsers, user]);
  const { data: categoryDocs } = useFirestore<{ name: string }>({ collectionName: COLLECTIONS.CATEGORIES });
  const { data: teams } = useFirestore<Team>({ collectionName: COLLECTIONS.TEAMS, enabled: isManager });
  const calendar = useWorkCalendar();

  // Team-level figures: the viewer's team's own demand (everything for admins)
  const teamRequests = useMemo(() => (user ? requests.filter(r => inViewerTeam(r, user)) : []), [requests, user]);

  const m = useMemo(() => {
    const now = new Date();
    const since = (days: number) => now.getTime() - days * DAY;
    const teamById = new Map(teams.map(t => [t.id, t]));
    const usersById = new Map(allUsers.map(u => [u.id, u]));
    const open = teamRequests.filter(isOpen);

    // ---- Demand ----
    const aging = agingBuckets(teamRequests, now);
    const recent = createdSince(teamRequests, WINDOW_DAYS, now);
    const weeks = weekKeys(addDays(startOfWeek(now), -7 * 7), 8);
    const weekOf = (d: Date | null) => (d ? toDateKey(startOfWeek(d)) : '');
    const createdPerWeek = weeks.map(w => teamRequests.filter(r => weekOf(firestoreDate(r.createdAt)) === w));
    const completedPerWeek = weeks.map(w => teamRequests.filter(r => r.status === 'completed' && weekOf(firestoreDate(r.completedAt)) === w));

    const byService = new Map<string, ServiceRequest[]>();
    for (const r of recent) byService.set(r.serviceName, [...(byService.get(r.serviceName) ?? []), r]);
    const byLob = new Map<string, ServiceRequest[]>();
    for (const r of recent) {
      const lob = r.lineOfBusiness || 'Not set';
      byLob.set(lob, [...(byLob.get(lob) ?? []), r]);
    }

    const coloured = categoryDocs.map(c => c.name).sort().slice(0, MAX_CATEGORY_SLOTS);
    const byCategory = coloured.map((name, i) => ({ key: name, label: name, value: recent.filter(r => r.category === name).length, color: SERIES[i] }));
    const otherCount = recent.filter(r => !coloured.includes(r.category)).length;
    if (otherCount) byCategory.push({ key: '__other', label: 'Other', value: otherCount, color: NEUTRAL });

    // ---- Capacity ----
    const periods = buildPeriods(now, 'month', 3);
    const forecast = buildForecast({
      users,
      requests: teamRequests,
      teamIds: isAdmin ? undefined : new Set([user?.teamId ?? '']),
      periods,
      unit: 'month',
      calendar
    });
    const thisWeek = weekKeys(now, 1);
    const weekRows = buildCapacity(users, teamRequests, thisWeek, calendar);
    const weekCapacity = weekRows.reduce((s, r) => s + r.weeklyCapacity, 0);
    const weekCommitted = weekRows.reduce((s, r) => s + r.allocated[thisWeek[0]], 0);
    const consumptionWeeks = weekKeys(addDays(startOfWeek(now), -21), 8);

    // ---- Delivery ----
    const health = (r: ServiceRequest) => deliveryHealth(r, now);
    const atRisk = open.filter(r => health(r) === 'at-risk' || health(r) === 'late');

    // ---- Performance (requests raised in the window, plus anything finished in it) ----
    const perfSet = teamRequests.filter(
      r => (firestoreDate(r.createdAt)?.getTime() ?? 0) >= since(WINDOW_DAYS * 2) || (firestoreDate(r.completedAt)?.getTime() ?? 0) >= since(WINDOW_DAYS)
    );
    const stageAverages = averageStageDurations(perfSet);
    const longest = stageAverages.reduce<(typeof stageAverages)[number] | null>(
      (best, s) => (s.averageDays !== null && (best === null || (best.averageDays ?? 0) < s.averageDays) ? s : best),
      null
    );
    const targets = targetPerformance(perfSet, r => teamById.get(r.teamId)?.serviceTargets, now).filter(t => t.measured > 0 || t.overdueNow > 0);
    const waiting = STAGES.map(s => {
      const items = open.map(r => ({ r, w: waitingIn(r, now) })).filter(x => x.w?.stage === s.key);
      return { ...s, items: items.map(x => x.r), avg: items.length ? items.reduce((a, x) => a + (x.w?.days ?? 0), 0) / items.length : 0 };
    });

    // ---- Value ----
    const done = completedSince(teamRequests, WINDOW_DAYS, now);
    const costs = done.map(r => requestCost(r, usersById, teamById.get(r.teamId)).actual).filter((c): c is number => c !== null);
    const effortByService = new Map<string, { hours: number; items: ServiceRequest[] }>();
    for (const r of done) {
      const e = effortByService.get(r.serviceName) ?? { hours: 0, items: [] };
      effortByService.set(r.serviceName, { hours: e.hours + (r.loggedHours || 0), items: [...e.items, r] });
    }
    const currencies = [...new Set(done.map(r => teamById.get(r.teamId)?.currency || DEFAULT_CURRENCY))];

    return {
      open,
      intake: teamRequests.filter(r => INTAKE_STATUSES.includes(r.status)),
      new30: createdSince(teamRequests, 30, now),
      aging,
      older: aging.slice(2).flatMap(b => b.items),
      weeks,
      createdPerWeek,
      completedPerWeek,
      byService: [...byService.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8),
      byLob: [...byLob.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8),
      byCategory,
      uncommitted: highestPriorityUncommitted(teamRequests),
      forecast,
      thisMonth: forecast.periods[0],
      gapPeriods: forecast.periods.filter(p => p.gap < 0),
      weekUtilization: utilization(weekCommitted, weekCapacity),
      consumptionWeeks,
      teamConsumption: summarizeTeams(buildCapacity(users, teamRequests, consumptionWeeks, calendar), consumptionWeeks, loggedByUserWeek(teamRequests)),
      committedNotStarted: teamRequests.filter(r => r.status === 'committed'),
      inProgress: teamRequests.filter(r => r.status === 'in-progress'),
      blocked: teamRequests.filter(r => r.status === 'blocked'),
      atRisk,
      overdue: open.filter(r => isOverdue(r, now)),
      upcoming: upcomingCommitments(teamRequests, 14, now),
      stageAverages,
      longest,
      targets,
      waiting,
      done,
      servicesDelivered: new Set(done.map(r => r.serviceName)).size,
      effort: done.reduce((s, r) => s + (r.loggedHours || 0), 0),
      cost: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      currency: currencies.length === 1 ? currencies[0] : user?.teamId ? teamById.get(user.teamId)?.currency || DEFAULT_CURRENCY : DEFAULT_CURRENCY,
      mixedCurrencies: currencies.length > 1,
      costAvoidance: costAvoidance(done, r => teamById.get(r.teamId)),
      timeSaved: sumOutcomes(done, 'time-saved'),
      revenue: sumOutcomes(done, 'revenue'),
      leadTimeDays: (() => {
        const days = done
          .map(r => {
            const c = firestoreDate(r.createdAt);
            const f = firestoreDate(r.completedAt);
            return c && f ? (f.getTime() - c.getTime()) / DAY : null;
          })
          .filter((d): d is number => d !== null);
        return days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
      })(),
      targetsMetPct: (() => {
        const measured = targets.reduce((s, t) => s + t.measured, 0);
        return measured ? Math.round((targets.reduce((s, t) => s + t.met, 0) / measured) * 100) : null;
      })(),
      outcomes: done.filter(r => r.outcome).sort((a, b) => (b.outcome!.recordedAt).localeCompare(a.outcome!.recordedAt)).slice(0, 5),
      withoutOutcome: done.filter(r => !r.outcome),
      effortByService: [...effortByService.entries()].sort((a, b) => b[1].hours - a[1].hours).slice(0, 8)
    };
  }, [teamRequests, users, allUsers, categoryDocs, teams, isAdmin, user?.teamId, calendar]);

  if (requestsLoading || usersLoading || !user) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const openRequest = (id: string) => navigate('/requests', { state: { openRequestId: id } });
  const show = (title: string, items: ServiceRequest[]) => setDrill({ title, items: [...items].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)) });
  const byPriority = (a: ServiceRequest, b: ServiceRequest) => priorityRank(a.priority) - priorityRank(b.priority);

  const myRequests = requests.filter(r => r.requesterId === user.id);
  const myWork = requests.filter(r => r.assigneeId === user.id && isOpen(r));

  const personal = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Panel title="My open requests" subtitle="Requests you've raised">
        <RequestList requests={myRequests.filter(isOpen).sort(byPriority).slice(0, 6)} empty="You have no open requests." onOpen={openRequest} />
        <Link to="/requests" className="inline-block mt-4 text-sm font-medium text-blue-600 hover:text-blue-700">View all requests →</Link>
      </Panel>
      <Panel title="My work" subtitle="Requests assigned to you">
        <RequestList requests={myWork.sort(byPriority).slice(0, 6)} empty="Nothing is assigned to you." onOpen={openRequest} />
      </Panel>
    </div>
  );

  if (!isManager) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <DashboardCard title="My open requests" value={myRequests.filter(isOpen).length} icon={ClipboardList} color="bg-blue-600" />
          <DashboardCard title="Assigned to me" value={myWork.length} icon={ListTodo} color="bg-cyan-600" />
          <DashboardCard title="My overdue work" value={myWork.filter(r => isOverdue(r)).length} icon={AlarmClock} color="bg-red-600" />
        </div>
        {personal}
      </div>
    );
  }

  const teamName = isAdmin ? 'All teams' : teams.find(t => t.id === user.teamId)?.name ?? user.team ?? 'Your team';
  const statusData = OPEN_STATUSES.map(s => ({ key: s, label: STATUS_STYLES[s].label, value: m.open.filter(r => r.status === s).length, color: STATUS_COLORS[s] }));
  const priorityGroups = [...PRIORITIES.map(p => m.open.filter(r => r.priority === p)), m.open.filter(r => !r.priority)];
  const priorityLabels = [...PRIORITIES.map(p => PRIORITY_STYLES[p].label), 'Not assessed'];
  const attention = [...new Set([...m.blocked, ...m.overdue, ...m.atRisk])].sort(byPriority);
  const money = (n: number) => formatMoney(n, m.currency);

  // Cost avoidance a year: hours saved per month × 12 × the value of an hour saved (confirmed in outcomes,
  // or expected at assessment until then), plus any amounts entered directly on outcomes
  const ca = m.costAvoidance;
  const hoursSavedPerMonth = ca.confirmedHoursPerMonth + ca.expectedHoursPerMonth;
  const avoidedPerYear =
    ca.confirmedPerYear !== null || ca.expectedPerYear !== null || ca.directCount > 0
      ? (ca.confirmedPerYear ?? 0) + (ca.expectedPerYear ?? 0) + ca.direct
      : null;
  const avoidedSub =
    hoursSavedPerMonth > 0 && ca.confirmedPerYear === null && ca.expectedPerYear === null
      ? 'Set a value of an hour saved on the Team page'
      : avoidedPerYear === null
      ? 'No hours saved recorded yet'
      : ca.expectedPerYear
      ? `${money(ca.confirmedPerYear ?? 0)} confirmed · ${money(ca.expectedPerYear)} expected`
      : `Confirmed in ${ca.confirmedCount + ca.directCount} outcomes`;

  // Every headline figure a team can show
  const kpiCards: Record<KpiKey, React.ComponentProps<typeof Kpi>> = {
    open: { icon: Inbox, label: 'Open demand', value: m.open.length, sub: `${m.new30.length} new in 30 days`, onClick: () => show('Open demand', m.open) },
    awaiting: {
      icon: ListTodo,
      label: 'Awaiting assessment',
      value: m.intake.length,
      sub: m.older.length ? `${m.older.length} open over a month` : 'None aging',
      tone: m.intake.length ? 'warn' : undefined,
      onClick: () => show('Waiting for assessment', m.intake)
    },
    committedPct: {
      icon: Gauge,
      label: 'Committed this month',
      value: `${utilization(m.thisMonth.committed, m.thisMonth.capacity)}%`,
      sub: `${formatHours(Math.round(m.thisMonth.committed))} of ${formatHours(Math.round(m.thisMonth.capacity))}`,
      onClick: () => show(`Committed work, ${m.thisMonth.label}`, m.thisMonth.committedItems.map(i => i.request))
    },
    outlook: {
      icon: CalendarRange,
      label: 'Capacity outlook',
      value: m.gapPeriods.length ? `${m.gapPeriods.length} short` : 'On track',
      sub: m.gapPeriods.length ? m.gapPeriods.map(p => p.label).join(', ') : 'Next 3 months',
      tone: m.gapPeriods.length ? 'bad' : 'good',
      onClick: () => navigate('/capacity')
    },
    attention: {
      icon: AlertTriangle,
      label: 'Needs attention',
      value: attention.length,
      sub: `${m.blocked.length} blocked · ${m.overdue.length} overdue · ${m.atRisk.length} at risk`,
      tone: attention.length ? 'bad' : 'good',
      onClick: () => show('Blocked, overdue, or at risk', attention)
    },
    completed: {
      icon: CheckCircle2,
      label: `Completed (${WINDOW_DAYS} days)`,
      value: m.done.length,
      sub: avoidedPerYear !== null ? `${money(avoidedPerYear)} a year cost avoided` : `${formatHours(Math.round(m.effort))} effort`,
      tone: 'good',
      onClick: () => show(`Completed in the last ${WINDOW_DAYS} days`, m.done)
    },
    new30: { icon: Inbox, label: 'New demand (30 days)', value: m.new30.length, onClick: () => show('New demand, last 30 days', m.new30) },
    overdue: { icon: AlarmClock, label: 'Overdue', value: m.overdue.length, tone: m.overdue.length ? 'bad' : 'good', onClick: () => show('Overdue', m.overdue) },
    leadTime: {
      icon: Timer,
      label: 'Average lead time',
      value: m.leadTimeDays === null ? '—' : `${Math.round(m.leadTimeDays * 10) / 10}d`,
      sub: `Request to completion, last ${WINDOW_DAYS} days`
    },
    targets: {
      icon: Target,
      label: 'Service targets met',
      value: m.targetsMetPct === null ? '—' : `${m.targetsMetPct}%`,
      sub: m.targetsMetPct === null ? 'No targets measured' : 'Across all targets',
      tone: m.targetsMetPct === null ? undefined : m.targetsMetPct >= 80 ? 'good' : m.targetsMetPct >= 50 ? 'warn' : 'bad'
    },
    costAvoidance: {
      icon: Coins,
      label: 'Cost avoidance',
      value: avoidedPerYear !== null ? money(avoidedPerYear) : '—',
      sub: avoidedSub,
      tone: 'good'
    },
    effort: { icon: Clock, label: `Effort (${WINDOW_DAYS} days)`, value: formatHours(Math.round(m.effort)), sub: 'Logged on completed work' }
  };
  const chosenKpis = isAdmin ? DEFAULT_KPIS : kpisOf(teams.find(t => t.id === user.teamId));
  const viewAll = (title: string, items: ServiceRequest[]) =>
    items.length > 5 ? (
      <button onClick={() => show(title, items)} className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap">View all {items.length}</button>
    ) : undefined;

  return (
    <div className="p-6 lg:p-8 max-w-[1600px]">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">{teamName} · {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <p className="text-xs text-gray-400">Click any figure to see the requests behind it</p>
      </div>

      {/* 1. Headline figures (the team's chosen KPIs) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {chosenKpis.map(key => {
          const k = kpiCards[key];
          return <Kpi key={key} {...k} />;
        })}
      </div>

      {/* 2. Pipeline: how much demand is in each stage */}
      <PipelineSummary requests={teamRequests} onShow={show} />

      {/* 3. Detailed reports, one at a time */}
      <div className="mt-6">
        <div className="flex flex-wrap gap-1 border-b border-gray-200" role="tablist" aria-label="Reports">
          {REPORT_TABS.map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={report === t.key}
              onClick={() => setReport(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                report === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pt-4">
          {report === 'demand' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
              <Panel title="Backlog aging" subtitle="Open demand by time since raised">
                <BarChart
                  data={m.aging.map(b => ({ key: b.key, label: b.label, value: b.items.length, color: b.key === 'quarter' || b.key === 'older' ? STATUS.warning : SERIES[0] }))}
                  onSelect={key => { const b = m.aging.find(x => x.key === key); if (b) show(`Open demand: ${b.label}`, b.items); }}
                />
              </Panel>
              <Panel title="By service" subtitle={`Raised in the last ${WINDOW_DAYS} days`}>
                <BarChart
                  data={m.byService.map(([label, items]) => ({ key: label, label, value: items.length, color: SERIES[0] }))}
                  emptyText="No requests yet."
                  onSelect={key => show(`Demand for ${key}`, m.byService.find(([l]) => l === key)?.[1] ?? [])}
                />
              </Panel>
              <Panel title="By line of business" subtitle={`Raised in the last ${WINDOW_DAYS} days`}>
                <BarChart
                  data={m.byLob.map(([label, items]) => ({ key: label, label, value: items.length, color: SERIES[2] }))}
                  emptyText="No requests yet."
                  onSelect={key => show(`Demand for ${key}`, m.byLob.find(([l]) => l === key)?.[1] ?? [])}
                />
              </Panel>
              <Panel title="By category" subtitle={`Last ${WINDOW_DAYS} days`}>
                <DonutChart data={m.byCategory} centerLabel="requests" size={150} thickness={22} emptyText="No requests yet." />
              </Panel>
            </div>
          )}

          {report === 'priority' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Panel title="Open demand by priority" subtitle="Darker is more urgent">
                <ColumnChart
                  categories={priorityLabels}
                  series={[{
                    key: 'open',
                    label: 'Open requests',
                    values: priorityGroups.map(g => g.length),
                    color: PRIORITY_RAMP.high,
                    colors: [PRIORITY_RAMP.critical, PRIORITY_RAMP.high, PRIORITY_RAMP.medium, PRIORITY_RAMP.low, NEUTRAL]
                  }]}
                  height={180}
                  showValues
                  onSelect={i => show(`Open demand: ${priorityLabels[i]}`, priorityGroups[i])}
                />
              </Panel>
              <Panel title="Open demand by stage">
                <DonutChart data={statusData} centerLabel="open" size={150} thickness={22} emptyText="No open requests." />
              </Panel>
            </div>
          )}

          {report === 'capacity' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-5 pb-3 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Team consumption by week</h3>
                  <p className="text-xs text-gray-500">
                    {consumptionView === 'planned' ? 'Committed' : 'Logged'} hours as a share of capacity · last 3 weeks to the next 4 · this week {m.weekUtilization}% committed
                  </p>
                </div>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                  {(['planned', 'logged'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setConsumptionView(v)}
                      className={`px-3 py-1.5 font-medium ${consumptionView === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                    >
                      {v === 'planned' ? 'Committed' : 'Actual (logged)'}
                    </button>
                  ))}
                </div>
              </div>
              <TeamConsumptionTable
                summaries={m.teamConsumption}
                weeks={m.consumptionWeeks}
                view={consumptionView}
                thisWeek={toDateKey(startOfWeek(new Date()))}
                onSelectTeam={team => navigate('/capacity', { state: { openTeam: team } })}
              />
            </div>
          )}

          {report === 'delivery' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Figure label="Committed, not started" value={m.committedNotStarted.length} onClick={() => show('Committed, not started', m.committedNotStarted)} />
                <Figure label="In progress" value={m.inProgress.length} onClick={() => show('In progress', m.inProgress)} />
                <Figure label="At risk" value={m.atRisk.length} tone={m.atRisk.length ? 'warn' : undefined} onClick={() => show('At risk or late', m.atRisk)} />
                <Figure label="Blocked" value={m.blocked.length} tone={m.blocked.length ? 'bad' : undefined} onClick={() => show('Blocked', m.blocked)} />
                <Figure label="Overdue" value={m.overdue.length} tone={m.overdue.length ? 'bad' : undefined} onClick={() => show('Overdue', m.overdue)} />
              </div>
              <Panel title="In progress" subtitle="Work underway, most urgent first" action={viewAll('In progress', m.inProgress)}>
                <RequestList requests={[...m.inProgress].sort(byPriority).slice(0, 5)} empty="Nothing in progress." onOpen={openRequest} />
              </Panel>
            </div>
          )}

          {report === 'performance' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Panel title="Average days per stage" subtitle="Recent requests">
                <BarChart
                  data={m.stageAverages.filter(s => s.averageDays !== null).map(s => ({
                    key: s.key,
                    label: s.label,
                    value: Math.round((s.averageDays ?? 0) * 10) / 10,
                    valueLabel: `${Math.round((s.averageDays ?? 0) * 10) / 10}d`,
                    color: m.longest?.key === s.key ? SERIES[1] : SERIES[0],
                    tooltip: <div className="text-gray-500 mt-1">Across {s.count} requests</div>
                  }))}
                  emptyText="Not enough history yet."
                />
                {m.longest && <p className="mt-3 text-xs text-gray-600">Work waits longest in <strong>{m.longest.label}</strong>.</p>}
              </Panel>
              <Panel title="Waiting now" subtitle="Open work by the stage it's in">
                <BarChart
                  data={m.waiting.filter(w => w.items.length).map(w => ({
                    key: w.key,
                    label: w.label,
                    value: w.items.length,
                    valueLabel: `${w.items.length} · avg ${Math.round(w.avg)}d`,
                    color: SERIES[2]
                  }))}
                  emptyText="Nothing open."
                  onSelect={key => { const w = m.waiting.find(x => x.key === key); if (w) show(`Waiting in ${w.label}`, w.items); }}
                />
              </Panel>
              <Panel title="Service targets" subtitle="Finished measurements meeting the target">
                {m.targets.length === 0 ? (
                  <p className="text-sm text-gray-500">No targets set. Add them on the Team page (Targets &amp; cost).</p>
                ) : (
                  <BarChart
                    data={m.targets.map(t => ({
                      key: t.key,
                      label: t.label,
                      value: t.metPct ?? 0,
                      valueLabel: t.metPct === null ? 'none finished' : `${t.metPct}% met`,
                      color: (t.metPct ?? 100) >= 80 ? STATUS.good : (t.metPct ?? 0) >= 50 ? STATUS.warning : STATUS.critical,
                      badge: t.overdueNow ? <span className="text-amber-700 flex items-center gap-0.5"><AlertTriangle size={12} />{t.overdueNow} overdue</span> : undefined,
                      tooltip: <div className="text-gray-500 mt-1">{t.met} of {t.measured} met</div>
                    }))}
                    max={100}
                  />
                )}
              </Panel>
            </div>
          )}

          {report === 'value' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <Figure label={`Completed (${WINDOW_DAYS} days)`} value={m.done.length} onClick={() => show(`Completed in the last ${WINDOW_DAYS} days`, m.done)} />
                <Figure label="Services delivered" value={m.servicesDelivered} />
                <Figure label="Effort consumed" value={formatHours(Math.round(m.effort))} />
                <Figure label="Cost" value={m.cost === null ? '—' : money(m.cost)} sub={m.cost === null ? 'Set rates on the Team page' : m.mixedCurrencies ? 'Mixed currencies' : undefined} />
                <Figure
                  label="Cost avoidance (a year)"
                  value={avoidedPerYear !== null ? money(avoidedPerYear) : '—'}
                  sub={avoidedSub}
                  onClick={() => show('Completed work with hours saved', m.done.filter(r => r.outcome?.hoursSavedPerMonth || r.expectedBenefit?.hoursSavedPerMonth))}
                />
                <Figure
                  label="Hours saved a month"
                  value={hoursSavedPerMonth ? formatHours(Math.round(hoursSavedPerMonth * 10) / 10) : '—'}
                  sub={
                    m.costAvoidance.expectedHoursPerMonth
                      ? `${formatHours(Math.round(m.costAvoidance.confirmedHoursPerMonth))} confirmed · ${formatHours(Math.round(m.costAvoidance.expectedHoursPerMonth))} expected`
                      : m.revenue.count
                      ? `+ ${money(m.revenue.total)} revenue`
                      : hoursSavedPerMonth
                      ? 'Confirmed in outcomes'
                      : 'Set expected benefit at assessment'
                  }
                />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel title="Effort by service" subtitle="Logged hours on completed work">
                  <BarChart
                    data={m.effortByService.map(([label, e]) => ({ key: label, label, value: Math.round(e.hours * 10) / 10, valueLabel: formatHours(e.hours), color: SERIES[0] }))}
                    emptyText="Nothing completed yet."
                    onSelect={key => show(`Completed: ${key}`, m.effortByService.find(([l]) => l === key)?.[1].items ?? [])}
                  />
                </Panel>
                <Panel
                  title="Recent outcomes"
                  subtitle="Value recorded on completed work"
                  action={m.withoutOutcome.length > 0 ? (
                    <button onClick={() => show('Completed without a recorded outcome', m.withoutOutcome)} className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap">
                      {m.withoutOutcome.length} without outcome
                    </button>
                  ) : undefined}
                >
                  {m.outcomes.length === 0 ? (
                    <p className="text-sm text-gray-500">No outcomes recorded yet. Record them on a completed request's Outcome tab.</p>
                  ) : (
                    <ul className="space-y-2">
                      {m.outcomes.map(r => (
                        <li key={r.id}>
                          <button onClick={() => openRequest(r.id)} className="w-full text-left p-3 rounded-lg bg-gray-50 hover:bg-gray-100">
                            <p className="text-sm font-medium text-gray-900">{r.title}</p>
                            <p className="text-xs text-gray-500">{r.outcome!.types.map(outcomeLabel).join(', ')}</p>
                            <p className="mt-1 text-sm text-gray-700 line-clamp-2">{r.outcome!.summary}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </div>
          )}

          {report === 'mine' && personal}
        </div>
      </div>

      {/* 4. Action lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Panel title="Needs attention" subtitle="Blocked, overdue, or at risk" action={viewAll('Blocked, overdue, or at risk', attention)}>
          <RequestList requests={attention.slice(0, 5)} empty="Nothing blocked, overdue, or at risk." onOpen={openRequest} />
        </Panel>
        <Panel title="Top priority, not yet committed" subtitle="Critical and high demand still in intake or planning" action={viewAll('Top priority, not yet committed', m.uncommitted)}>
          <RequestList requests={m.uncommitted.slice(0, 5)} empty="All critical and high demand is committed." onOpen={openRequest} />
        </Panel>
        <Panel title="Due in the next 14 days" subtitle="Committed work" action={viewAll('Due in the next 14 days', m.upcoming)}>
          <RequestList requests={m.upcoming.slice(0, 5)} empty="Nothing due in the next two weeks." onOpen={openRequest} />
        </Panel>
      </div>

      {/* 5. Headline charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Panel title="Demand trend" subtitle="New vs. completed requests per week">
          <ColumnChart
            categories={m.weeks.map(formatWeek)}
            series={[
              { key: 'new', label: 'New', values: m.createdPerWeek.map(x => x.length), color: SERIES[0] },
              { key: 'completed', label: 'Completed', values: m.completedPerWeek.map(x => x.length), color: SERIES[1] }
            ]}
            height={180}
            onSelect={i => show(`Week of ${formatWeek(m.weeks[i])}`, [...m.createdPerWeek[i], ...m.completedPerWeek[i]])}
          />
        </Panel>
        <Panel
          title="Capacity outlook"
          subtitle="Hours per month: available vs. committed vs. approved demand"
          action={<Link to="/capacity" className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap">Full forecast</Link>}
        >
          <ColumnChart
            categories={m.forecast.periods.map(p => p.label)}
            series={[
              { key: 'capacity', label: 'Available', values: m.forecast.periods.map(p => Math.round(p.capacity)), color: SERIES[2] },
              { key: 'committed', label: 'Committed', values: m.forecast.periods.map(p => Math.round(p.committed)), color: SERIES[0] },
              { key: 'demand', label: 'Approved demand', values: m.forecast.periods.map(p => Math.round(p.demand)), color: SERIES[1] }
            ]}
            height={180}
            unit="h"
            onSelect={i => {
              const p = m.forecast.periods[i];
              show(`${p.label}: committed work and approved demand`, [...new Set([...p.committedItems, ...p.demandItems].map(x => x.request))]);
            }}
          />
        </Panel>
      </div>

      {drill && (
        <Modal title={drill.title} subtitle={`${drill.items.length} ${drill.items.length === 1 ? 'request' : 'requests'}`} onClose={() => setDrill(null)} width="max-w-3xl">
          <RequestList requests={drill.items} empty="Nothing here." onOpen={id => { setDrill(null); openRequest(id); }} />
        </Modal>
      )}
    </div>
  );
};

export default Dashboard;
