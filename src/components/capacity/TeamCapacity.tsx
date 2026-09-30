import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { ServiceRequest } from '../../types';
import {
  CapacityRow,
  compareByUrgency,
  formatHours,
  formatWeek,
  isOpen,
  isOverdue,
  loggedOn,
  plannedInWeeks,
  utilization,
  utilizationClass
} from '../../lib/demand';
import { PriorityBadge, StatusBadge } from '../RequestBadges';
import ColumnChart from '../charts/ColumnChart';
import BarChart from '../charts/BarChart';
import { SERIES } from '../charts/chartTheme';
import Stat from './Stat';

type RequestFilter = 'open' | 'period' | 'all';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

// A team's capacity, consumption, members, and requests over the selected weeks
const TeamCapacity = ({
  members,
  requests,
  weeks,
  logged,
  onSelectMember
}: {
  members: CapacityRow[];
  requests: ServiceRequest[];
  weeks: string[];
  logged: Map<string, Map<string, number>>; // user → week → hours
  onSelectMember: (userId: string) => void;
}) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<RequestFilter>('open');

  const weekSet = useMemo(() => new Set(weeks), [weeks]);
  const memberIds = useMemo(() => new Set(members.map(m => m.userId)), [members]);
  const loggedFor = (userId: string, week: string) => logged.get(userId)?.get(week) || 0;

  // Per-week team totals
  const capacityPerWeek = weeks.map(() => sum(members.map(m => m.weeklyCapacity)));
  const plannedPerWeek = weeks.map(w => sum(members.map(m => m.allocated[w])));
  const loggedPerWeek = weeks.map(w => sum(members.map(m => loggedFor(m.userId, w))));

  const capacity = sum(capacityPerWeek);
  const planned = sum(plannedPerWeek);
  const loggedTotal = sum(loggedPerWeek);

  const teamRequests = useMemo(
    () =>
      requests
        .filter(r => memberIds.has(r.assigneeId))
        .map(r => ({
          request: r,
          plannedInPeriod: plannedInWeeks(r, weekSet),
          loggedInPeriod: loggedOn(r, { byIds: memberIds, weeks: weekSet })
        }))
        .sort((a, b) => compareByUrgency(a.request, b.request)),
    [requests, memberIds, weekSet]
  );

  const open = teamRequests.filter(t => isOpen(t.request));
  const overdue = open.filter(t => isOverdue(t.request));
  const remaining = sum(open.map(t => Math.max(t.request.estimatedHours - t.request.loggedHours, 0)));
  const overWeeks = weeks.filter((_, i) => plannedPerWeek[i] > capacityPerWeek[i]);

  const visible = teamRequests.filter(t =>
    filter === 'open' ? isOpen(t.request) : filter === 'period' ? t.plannedInPeriod > 0 || t.loggedInPeriod > 0 : true
  );

  // Remaining estimated hours of open work, by service
  const byService = new Map<string, number>();
  for (const { request: r } of open) {
    byService.set(r.serviceName, (byService.get(r.serviceName) || 0) + Math.max(r.estimatedHours - r.loggedHours, 0));
  }
  const serviceBars = [...byService.entries()]
    .filter(([, hours]) => hours > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, hours]) => ({ key: label, label, value: Math.round(hours * 10) / 10, valueLabel: formatHours(hours), color: SERIES[0] }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Capacity in period" value={formatHours(capacity)} sub={`${members.length} people`} />
        <Stat label="Planned" value={`${utilization(planned, capacity)}%`} sub={`${formatHours(planned)} planned`} alert={planned > capacity} />
        <Stat label="Actual (logged)" value={`${utilization(loggedTotal, capacity)}%`} sub={`${formatHours(loggedTotal)} logged`} />
        <Stat label="Open requests" value={String(open.length)} sub={`${formatHours(remaining)} estimated remaining`} />
        <Stat label="Overdue" value={String(overdue.length)} alert={overdue.length > 0} />
      </div>

      {overWeeks.length > 0 && (
        <div className="flex gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          <AlertTriangle size={18} className="shrink-0" />
          The team is over capacity in {overWeeks.length} week(s): {overWeeks.map(formatWeek).join(', ')}.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Weekly consumption</h3>
          <ColumnChart
            categories={weeks.map(formatWeek)}
            series={[
              { key: 'planned', label: 'Planned', values: plannedPerWeek.map(h => Math.round(h * 10) / 10), color: SERIES[0] },
              { key: 'logged', label: 'Logged', values: loggedPerWeek.map(h => Math.round(h * 10) / 10), color: SERIES[1] }
            ]}
            height={160}
            unit="h"
          />
          <p className="mt-2 text-xs text-gray-500">Team capacity is {formatHours(capacityPerWeek[0] ?? 0)} per week.</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Open work by service</h3>
          <BarChart data={serviceBars} emptyText="No open work with estimates." />
          <p className="mt-2 text-xs text-gray-500">Estimated hours still remaining</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Members</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Person</th>
                <th className="px-3 py-2 text-right font-medium">Capacity / wk</th>
                <th className="px-3 py-2 text-right font-medium">Planned</th>
                <th className="px-3 py-2 text-right font-medium">Logged</th>
                <th className="px-3 py-2 text-right font-medium">Open requests</th>
                <th className="px-3 py-2 text-right font-medium">Overdue</th>
                <th className="px-3 py-2 text-right font-medium">Weeks over</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map(m => {
                const memberCapacity = m.weeklyCapacity * weeks.length;
                const memberPlanned = sum(weeks.map(w => m.allocated[w]));
                const memberLogged = sum(weeks.map(w => loggedFor(m.userId, w)));
                const memberOpen = open.filter(t => t.request.assigneeId === m.userId);
                const plannedPct = utilization(memberPlanned, memberCapacity);
                const weeksOver = weeks.filter(w => m.allocated[w] > m.weeklyCapacity).length;
                return (
                  <tr key={m.userId} onClick={() => onSelectMember(m.userId)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-2 font-medium text-blue-700">{m.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(m.weeklyCapacity)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${utilizationClass(plannedPct)}`}>
                        {plannedPct}% · {formatHours(memberPlanned)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {utilization(memberLogged, memberCapacity)}% · {formatHours(memberLogged)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{memberOpen.length}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${memberOpen.some(t => isOverdue(t.request)) ? 'text-red-600 font-medium' : ''}`}>
                      {memberOpen.filter(t => isOverdue(t.request)).length}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${weeksOver ? 'text-red-600 font-medium' : ''}`}>{weeksOver}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-500">Click a person to see their requests and weekly consumption.</p>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Team requests</h3>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {([
              ['open', 'Open'],
              ['period', 'Active in these weeks'],
              ['all', 'All']
            ] as [RequestFilter, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`px-3 py-1.5 font-medium ${filter === id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Request</th>
                <th className="px-3 py-2 text-left font-medium">Assignee</th>
                <th className="px-3 py-2 text-left font-medium">Priority</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Planned dates</th>
                <th className="px-3 py-2 text-right font-medium">Logged / est.</th>
                <th className="px-3 py-2 text-right font-medium">Planned in period</th>
                <th className="px-3 py-2 text-right font-medium">Logged in period</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">No requests to show.</td></tr>
              ) : (
                visible.map(({ request: r, plannedInPeriod, loggedInPeriod }) => (
                  <tr key={r.id} onClick={() => navigate('/requests', { state: { openRequestId: r.id } })} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-2">
                      <div className="text-xs font-mono text-gray-500">{r.requestNumber}</div>
                      <div className="font-medium text-gray-900">{r.title}</div>
                      <div className="text-xs text-gray-500">{r.serviceName}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{r.assigneeName}</td>
                    <td className="px-3 py-2"><PriorityBadge priority={r.priority} /></td>
                    <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                    <td className={`px-3 py-2 whitespace-nowrap ${isOverdue(r) ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                      {r.startDate ? `${r.startDate} → ${r.dueDate}` : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${r.estimatedHours > 0 && r.loggedHours > r.estimatedHours ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                      {formatHours(r.loggedHours)} / {r.estimatedHours ? formatHours(r.estimatedHours) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{plannedInPeriod ? formatHours(plannedInPeriod) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{loggedInPeriod ? formatHours(loggedInPeriod) : '—'}</td>
                    <td className="px-2 py-2 text-gray-400"><ExternalLink size={14} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TeamCapacity;
