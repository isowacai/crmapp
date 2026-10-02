import { useMemo, useState } from 'react';
import { useWorkCalendar } from '../../hooks/useWorkCalendar';
import { AlertTriangle } from 'lucide-react';
import { ServiceRequest, User } from '../../types';
import { formatHours } from '../../lib/demand';
import { buildForecast, buildPeriods, ForecastItem, ForecastPeriod, PeriodUnit } from '../../lib/forecast';
import ColumnChart from '../charts/ColumnChart';
import { SERIES } from '../charts/chartTheme';
import Modal from '../Modal';
import { PriorityBadge, StatusBadge } from '../RequestBadges';
import Stat from './Stat';

type Drill = { title: string; subtitle: string; items: ForecastItem[] };

const round = (n: number) => Math.round(n);

// Forward-looking capacity: available capacity vs. committed work and approved demand per period,
// with drill-down to the demand behind each number
const ForecastView = ({
  users,
  requests,
  teamIds,
  onOpenRequest
}: {
  users: User[];
  requests: ServiceRequest[];
  teamIds?: Set<string>;
  onOpenRequest: (id: string) => void;
}) => {
  const [unit, setUnit] = useState<PeriodUnit>('month');
  const [count, setCount] = useState(6);
  const [drill, setDrill] = useState<Drill | null>(null);
  const calendar = useWorkCalendar();

  const { periods, unscheduled } = useMemo(
    () => buildForecast({ users, requests, teamIds, periods: buildPeriods(new Date(), unit, count), unit, calendar }),
    [users, requests, teamIds, unit, count, calendar]
  );

  const totals = periods.reduce(
    (t, p) => ({ capacity: t.capacity + p.capacity, committed: t.committed + p.committed, demand: t.demand + p.demand }),
    { capacity: 0, committed: 0, demand: 0 }
  );
  const shortfalls = periods.filter(p => p.gap < 0);
  const unscheduledHours = unscheduled.reduce((s, i) => s + i.hours, 0);

  const open = (p: ForecastPeriod, kind: 'committed' | 'demand' | 'both') =>
    setDrill({
      title: `${p.label} · ${kind === 'committed' ? 'Committed work' : kind === 'demand' ? 'Approved demand' : 'Committed work and approved demand'}`,
      subtitle: `${formatHours(round(p.capacity))} capacity · ${formatHours(round(p.committed))} committed · ${formatHours(round(p.demand))} approved demand`,
      items: kind === 'committed' ? p.committedItems : kind === 'demand' ? p.demandItems : [...p.committedItems, ...p.demandItems]
    });

  const Cell = ({ value, onClick, tone }: { value: number; onClick?: () => void; tone?: 'bad' | 'good' }) => (
    <td className="px-2 py-1.5 text-right">
      {onClick && value !== 0 ? (
        <button
          onClick={onClick}
          className={`w-full text-right tabular-nums rounded px-2 py-1 hover:bg-blue-50 hover:text-blue-700 underline decoration-dotted underline-offset-2 ${tone === 'bad' ? 'text-red-700 font-semibold' : ''}`}
        >
          {round(value).toLocaleString()}
        </button>
      ) : (
        <span className={`block tabular-nums px-2 py-1 ${tone === 'bad' ? 'text-red-700 font-semibold' : tone === 'good' ? 'text-emerald-700' : 'text-gray-700'}`}>
          {round(value).toLocaleString()}
        </span>
      )}
    </td>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Hours per period. Capacity is each person's weekly hours pro-rated by working days; committed work is spread over
          its planned dates; approved demand counts in its target period (or requested completion month).
        </p>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white text-sm">
            {(['month', 'quarter'] as const).map(u => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`px-3 py-2 font-medium ${unit === u ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {u === 'month' ? 'Months' : 'Quarters'}
              </button>
            ))}
          </div>
          <select value={count} onChange={e => setCount(Number(e.target.value))} className="rounded-lg border-gray-300 text-sm" aria-label="Horizon">
            {[3, 6, 12].map(n => (
              <option key={n} value={n}>Next {n} {unit === 'month' ? 'months' : 'quarters'}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Available capacity" value={formatHours(round(totals.capacity))} />
        <Stat label="Committed work" value={formatHours(round(totals.committed))} sub={`${totals.capacity ? Math.round((totals.committed / totals.capacity) * 100) : 0}% of capacity`} />
        <Stat label="Approved demand (not committed)" value={formatHours(round(totals.demand))} sub={unscheduledHours ? `+ ${formatHours(round(unscheduledHours))} unscheduled` : undefined} />
        <Stat
          label="Periods short of capacity"
          value={String(shortfalls.length)}
          sub={shortfalls.length ? shortfalls.map(p => p.label).join(', ') : 'Demand fits in every period'}
          alert={shortfalls.length > 0}
        />
      </div>

      {shortfalls.length > 0 && (
        <div className="flex gap-2 p-3 rounded-lg bg-red-50 text-red-800 text-sm">
          <AlertTriangle size={18} className="shrink-0" />
          Approved demand exceeds remaining capacity in {shortfalls.map(p => `${p.label} (${formatHours(round(-p.gap))} short)`).join(', ')}.
          Consider deferring, reprioritizing, or moving target periods.
        </div>
      )}

      <div className="card p-6">
        <ColumnChart
          categories={periods.map(p => p.label)}
          series={[
            { key: 'capacity', label: 'Available capacity', values: periods.map(p => round(p.capacity)), color: SERIES[2] },
            { key: 'committed', label: 'Committed work', values: periods.map(p => round(p.committed)), color: SERIES[0] },
            { key: 'demand', label: 'Approved demand', values: periods.map(p => round(p.demand)), color: SERIES[1] }
          ]}
          height={200}
          unit="h"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Hours</th>
                {periods.map(p => (
                  <th key={p.key} className={`px-4 py-3 text-right font-medium whitespace-nowrap ${p.gap < 0 ? 'text-red-700' : ''}`}>{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-4 py-2 font-medium">Available capacity</td>
                {periods.map(p => <Cell key={p.key} value={p.capacity} />)}
              </tr>
              <tr>
                <td className="px-4 py-2 font-medium">Committed work</td>
                {periods.map(p => <Cell key={p.key} value={p.committed} onClick={() => open(p, 'committed')} />)}
              </tr>
              <tr>
                <td className="px-4 py-2 font-medium">Approved demand</td>
                {periods.map(p => <Cell key={p.key} value={p.demand} onClick={() => open(p, 'demand')} />)}
              </tr>
              <tr>
                <td className="px-4 py-2 font-medium">Remaining capacity</td>
                {periods.map(p => <Cell key={p.key} value={p.remaining} tone={p.remaining < 0 ? 'bad' : undefined} />)}
              </tr>
              <tr className="bg-gray-50">
                <td className="px-4 py-2 font-semibold">
                  Capacity gap
                  <span className="block text-xs font-normal text-gray-500">remaining − approved demand</span>
                </td>
                {periods.map(p => (
                  <Cell key={p.key} value={p.gap} tone={p.gap < 0 ? 'bad' : 'good'} onClick={p.gap < 0 ? () => open(p, 'both') : undefined} />
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
          Click a committed or demand figure (or a negative gap) to see the requests behind it.
        </p>
      </div>

      {unscheduled.length > 0 && (
        <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-700">
            <strong>{unscheduled.length}</strong> approved {unscheduled.length === 1 ? 'request' : 'requests'} ({formatHours(round(unscheduledHours))}) {unscheduled.length === 1 ? 'has' : 'have'} no target period or requested date, so {unscheduled.length === 1 ? "it isn't" : "they aren't"} in the forecast.
          </p>
          <button
            onClick={() => setDrill({ title: 'Unscheduled approved demand', subtitle: 'Set a target period to include these in the forecast', items: unscheduled })}
            className="px-3 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50"
          >
            View
          </button>
        </div>
      )}

      {drill && (
        <Modal title={drill.title} subtitle={drill.subtitle} onClose={() => setDrill(null)} width="max-w-3xl">
          {drill.items.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing here.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Request</th>
                    <th className="px-3 py-2 text-left font-medium">Priority</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Owner</th>
                    <th className="px-3 py-2 text-right font-medium">Hours in period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {drill.items.map(({ request: r, hours }) => (
                    <tr key={r.id} onClick={() => onOpenRequest(r.id)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-3 py-2">
                        <div className="text-xs font-mono text-gray-500">{r.requestNumber}</div>
                        <div className="font-medium text-gray-900">{r.title}</div>
                        <div className="text-xs text-gray-500">{r.serviceName}</div>
                      </td>
                      <td className="px-3 py-2"><PriorityBadge priority={r.priority} overridden={!!r.priorityOverride} score={r.priorityScore} /></td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-gray-700">{r.assigneeName || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatHours(hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">Click a request to open it on the Demand page.</p>
        </Modal>
      )}
    </div>
  );
};

export default ForecastView;
