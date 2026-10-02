import { useMemo, useState } from 'react';
import { useWorkCalendar } from '../../hooks/useWorkCalendar';
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
import { SERIES } from '../charts/chartTheme';
import Stat from './Stat';

type RequestFilter = 'open' | 'period' | 'all';

interface PersonRequest {
  request: ServiceRequest;
  plannedInPeriod: number; // this person's planned hours on it within the selected weeks
  loggedInPeriod: number; // hours this person logged on it within the selected weeks
  loggedByPerson: number; // all hours this person has logged on it
}

// Everything assigned to one person, and how their time is consumed over the selected weeks
const PersonCapacity = ({
  row,
  requests,
  weeks,
  loggedByWeek
}: {
  row: CapacityRow;
  requests: ServiceRequest[];
  weeks: string[];
  loggedByWeek: Map<string, number>;
}) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<RequestFilter>('open');

  const weekSet = useMemo(() => new Set(weeks), [weeks]);
  const calendar = useWorkCalendar();

  const personRequests: PersonRequest[] = useMemo(() => {
    const me = new Set([row.userId]);
    const result: PersonRequest[] = [];
    for (const r of requests) {
      const loggedByPerson = loggedOn(r, { byIds: me });
      if (r.assigneeId !== row.userId && loggedByPerson === 0) continue;

      result.push({
        request: r,
        plannedInPeriod: r.assigneeId === row.userId ? plannedInWeeks(r, weekSet, calendar) : 0,
        loggedInPeriod: loggedOn(r, { byIds: me, weeks: weekSet }),
        loggedByPerson
      });
    }
    return result.sort((a, b) => compareByUrgency(a.request, b.request));
  }, [requests, row.userId, weekSet]);

  const visible = personRequests.filter(p =>
    filter === 'open' ? isOpen(p.request) : filter === 'period' ? p.plannedInPeriod > 0 || p.loggedInPeriod > 0 : true
  );

  const capacity = row.weeklyCapacity * weeks.length;
  const planned = weeks.reduce((sum, w) => sum + row.allocated[w], 0);
  const logged = weeks.reduce((sum, w) => sum + (loggedByWeek.get(w) || 0), 0);
  const open = personRequests.filter(p => p.request.assigneeId === row.userId && isOpen(p.request));
  const overdue = open.filter(p => isOverdue(p.request));
  const overWeeks = weeks.filter(w => row.allocated[w] > row.weeklyCapacity);
  const remaining = open.reduce((sum, p) => sum + Math.max(p.request.estimatedHours - p.request.loggedHours, 0), 0);

  const openRequest = (id: string) => navigate('/requests', { state: { openRequestId: id } });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Capacity in period" value={formatHours(capacity)} sub={`${formatHours(row.weeklyCapacity)} / week`} />
        <Stat label="Planned" value={`${utilization(planned, capacity)}%`} sub={`${formatHours(planned)} planned`} alert={planned > capacity} />
        <Stat label="Actual (logged)" value={`${utilization(logged, capacity)}%`} sub={`${formatHours(logged)} logged`} />
        <Stat label="Open requests" value={String(open.length)} sub={`${formatHours(remaining)} estimated remaining`} />
        <Stat label="Overdue" value={String(overdue.length)} alert={overdue.length > 0} />
      </div>

      {overWeeks.length > 0 && (
        <div className="flex gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          <AlertTriangle size={18} className="shrink-0" />
          Over capacity in {overWeeks.length} week(s): {overWeeks.map(formatWeek).join(', ')}.
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Weekly consumption</h3>
        <ColumnChart
          categories={weeks.map(formatWeek)}
          series={[
            { key: 'planned', label: 'Planned', values: weeks.map(w => Math.round(row.allocated[w] * 10) / 10), color: SERIES[0] },
            { key: 'logged', label: 'Logged', values: weeks.map(w => Math.round((loggedByWeek.get(w) || 0) * 10) / 10), color: SERIES[1] }
          ]}
          height={150}
          unit="h"
        />
        <div className="overflow-x-auto mt-4 rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Week of</th>
                {weeks.map(w => <th key={w} className="px-2 py-2 text-center font-medium whitespace-nowrap">{formatWeek(w)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-2 text-gray-600">Planned</td>
                {weeks.map(w => {
                  const pct = utilization(row.allocated[w], row.weeklyCapacity);
                  return (
                    <td key={w} className="px-1 py-1.5 text-center">
                      <span className={`inline-block min-w-[3.5rem] rounded px-1.5 py-1 text-xs font-medium tabular-nums ${utilizationClass(pct)}`}>
                        {formatHours(row.allocated[w])}
                      </span>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="px-3 py-2 text-gray-600">Logged</td>
                {weeks.map(w => (
                  <td key={w} className="px-2 py-2 text-center text-xs tabular-nums text-gray-700">
                    {formatHours(loggedByWeek.get(w) || 0)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2 text-gray-600">Capacity</td>
                {weeks.map(w => (
                  <td key={w} className="px-2 py-2 text-center text-xs tabular-nums text-gray-500">{formatHours(row.weeklyCapacity)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Requests</h3>
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
                <th className="px-3 py-2 text-left font-medium">Priority</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Planned dates</th>
                <th className="px-3 py-2 text-right font-medium" title="Logged by everyone / estimate">Logged / est.</th>
                <th className="px-3 py-2 text-right font-medium" title="This person's planned hours within the selected weeks">Planned in period</th>
                <th className="px-3 py-2 text-right font-medium" title="Hours this person logged within the selected weeks">Logged in period</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-500">No requests to show.</td>
                </tr>
              ) : (
                visible.map(({ request: r, plannedInPeriod, loggedInPeriod, loggedByPerson }) => {
                  const overBudget = r.estimatedHours > 0 && r.loggedHours > r.estimatedHours;
                  return (
                    <tr key={r.id} onClick={() => openRequest(r.id)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-3 py-2">
                        <div className="text-xs font-mono text-gray-500">{r.requestNumber}</div>
                        <div className="font-medium text-gray-900">{r.title}</div>
                        <div className="text-xs text-gray-500">
                          {r.serviceName}
                          {r.assigneeId !== row.userId && ` · now assigned to ${r.assigneeName || 'nobody'} (logged ${formatHours(loggedByPerson)})`}
                        </div>
                      </td>
                      <td className="px-3 py-2"><PriorityBadge priority={r.priority} /></td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className={`px-3 py-2 whitespace-nowrap ${isOverdue(r) ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                        {r.startDate ? `${r.startDate} → ${r.dueDate}` : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${overBudget ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                        {formatHours(r.loggedHours)} / {r.estimatedHours ? formatHours(r.estimatedHours) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{plannedInPeriod ? formatHours(plannedInPeriod) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{loggedInPeriod ? formatHours(loggedInPeriod) : '—'}</td>
                      <td className="px-2 py-2 text-gray-400"><ExternalLink size={14} /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-500">Click a request to open it on the Service Requests page.</p>
      </div>
    </div>
  );
};

export default PersonCapacity;
