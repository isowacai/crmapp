import React, { useMemo, useState } from 'react';
import { useWorkCalendar } from '../../hooks/useWorkCalendar';
import { AlertTriangle } from 'lucide-react';
import { ServiceRequest, User } from '../../types';
import CapacityCheck from '../capacity/CapacityCheck';
import {
  allocateByWeek,
  buildCapacity,
  formatHours,
  formatWeek,
  planWeeks,
  toDateKey,
  utilization
} from '../../lib/demand';

export interface PlanData {
  assigneeId: string;
  estimatedHours: number;
  startDate: string;
  dueDate: string;
  note: string;
  commit: boolean;
  weeklyPlan: Record<string, number> | null; // hours per week set by hand; null = spread evenly
}

const round = (hours: number) => Math.round(hours * 10) / 10;
// Hours that can go negative (over capacity), e.g. "−3h"
const signedHours = (hours: number) => (hours < -0.05 ? `−${formatHours(-hours)}` : formatHours(Math.max(hours, 0)));
const sumHours = (plan: Record<string, number>) => round(Object.values(plan).reduce((sum, h) => sum + h, 0));

const inputClass =
  'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

// Owner, estimate, and dates for approved demand, with the owner's existing committed load per week.
// The estimate is spread evenly over the working days unless the planner sets the hours week by week.
// "Save as planned" records a tentative plan; "Commit" allocates the capacity.
const PlanForm = ({
  request,
  users,
  requests,
  allowPlanned = true,
  onSubmit,
  onCancel
}: {
  request: ServiceRequest;
  users: User[];
  requests: ServiceRequest[];
  allowPlanned?: boolean; // false when the team commits directly
  onSubmit: (data: PlanData) => Promise<void>;
  onCancel: () => void;
}) => {
  const today = toDateKey(new Date());
  const defaultStart = request.startDate || today;
  // Default the due date to the requester's needed-by date when it's usable
  const defaultDue = request.dueDate || (request.neededBy && request.neededBy >= defaultStart ? request.neededBy : '');
  const underway = request.status === 'in-progress' || request.status === 'blocked';

  const [form, setForm] = useState<Omit<PlanData, 'commit'>>({
    assigneeId: request.assigneeId,
    estimatedHours: request.estimatedHours,
    startDate: defaultStart,
    dueDate: defaultDue,
    note: '',
    weeklyPlan: request.weeklyPlan ?? null
  });
  const [submitting, setSubmitting] = useState<'plan' | 'commit' | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(prev => ({ ...prev, [key]: value }));

  // Weeks covered by the planned dates
  const weeks = useMemo(() => planWeeks(form.startDate || today, form.dueDate), [form.startDate, form.dueDate, today]);

  // Changing the dates keeps a split by hand for the weeks still in the plan; the estimate follows it
  const setDate = (key: 'startDate' | 'dueDate', value: string) =>
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (!prev.weeklyPlan) return next;
      const inPlan = new Set(planWeeks(next.startDate, next.dueDate));
      const weeklyPlan = Object.fromEntries(Object.entries(prev.weeklyPlan).filter(([w]) => inPlan.has(w)));
      return { ...next, weeklyPlan, estimatedHours: sumHours(weeklyPlan) };
    });

  // Everyone's existing committed load in those weeks, excluding this request
  const calendar = useWorkCalendar(request.teamId);
  const capacity = useMemo(
    () => buildCapacity(users, requests.filter(r => r.id !== request.id), weeks, calendar),
    [users, requests, request.id, weeks, calendar]
  );

  const teamMemberIds = useMemo(
    () => new Set(users.filter(u => u.teamId === request.teamId).map(u => u.id)),
    [users, request.teamId]
  );

  const thisLoad = allocateByWeek(form, calendar);
  const hoursFor = (week: string) => (form.weeklyPlan ? form.weeklyPlan[week] ?? 0 : round(thisLoad.get(week) || 0));

  // Editing one week switches to a split by hand, starting from the current even spread
  const setWeek = (week: string, hours: number) =>
    setForm(prev => {
      const weeklyPlan = { ...(prev.weeklyPlan ?? Object.fromEntries(weeks.map(w => [w, round(thisLoad.get(w) || 0)]))), [week]: hours };
      return { ...prev, weeklyPlan, estimatedHours: sumHours(weeklyPlan) };
    });
  const teamUsers = useMemo(() => users.filter(u => u.teamId === request.teamId), [users, request.teamId]);

  const candidates = capacity
    .map(row => {
      const booked = weeks.reduce((sum, w) => sum + row.allocated[w], 0);
      return {
        ...row,
        bookedPct: utilization(booked, row.weeklyCapacity * weeks.length),
        freeHours: Math.max(row.weeklyCapacity * weeks.length - booked, 0),
        inTeam: teamMemberIds.has(row.userId)
      };
    })
    // The owning team first, then least booked
    .sort((a, b) => Number(b.inTeam) - Number(a.inTeam) || a.bookedPct - b.bookedPct);

  const selected = capacity.find(c => c.userId === form.assigneeId);
  const overloadedWeeks = selected
    ? weeks.filter(w => selected.allocated[w] + (thisLoad.get(w) || 0) > selected.weeklyCapacity)
    : [];

  const submit = async (commit: boolean) => {
    setSubmitting(commit ? 'commit' : 'plan');
    try {
      await onSubmit({ ...form, commit });
    } finally {
      setSubmitting(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    submit(submitter?.value !== 'plan');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Planned start</label>
          <input type="date" className={inputClass} value={form.startDate} onChange={e => setDate('startDate', e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Planned completion</label>
          <input
            type="date"
            className={inputClass}
            value={form.dueDate}
            min={form.startDate}
            onChange={e => setDate('dueDate', e.target.value)}
            required
          />
          {request.neededBy && form.dueDate > request.neededBy && (
            <p className="mt-1 text-xs text-amber-700">Later than the requested date ({request.neededBy})</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Estimated effort (hours)</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            className={inputClass}
            value={form.estimatedHours || ''}
            onChange={e => setForm(prev => ({ ...prev, estimatedHours: Number(e.target.value), weeklyPlan: null }))}
            required
          />
          {form.weeklyPlan && <p className="mt-1 text-xs text-gray-500">The total of the weekly hours below</p>}
        </div>
      </div>
      {form.startDate && form.dueDate >= form.startDate && form.estimatedHours > 0 && (
        <CapacityCheck
          request={request}
          effort={form.estimatedHours}
          start={form.startDate}
          end={form.dueDate}
          basis="planned dates"
          teamUsers={teamUsers}
          requests={requests}
        />
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700">Delivery owner</label>
        <select className={inputClass} value={form.assigneeId} onChange={e => set('assigneeId', e.target.value)} required>
          <option value="">Select a person</option>
          {candidates.map(c => (
            <option key={c.userId} value={c.userId}>
              {c.name} · {c.team} · {formatHours(c.freeHours)} available ({c.bookedPct}% committed)
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Available hours and "% committed" cover the selected dates. {request.teamName ? `${request.teamName} is listed first.` : ''}
        </p>
      </div>

      {selected && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs">
            <span className="text-gray-600">
              {form.weeklyPlan
                ? 'Hours split by week by hand.'
                : 'Hours spread evenly over the working days. Change a week to split them yourself.'}
            </span>
            {form.weeklyPlan && (
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, weeklyPlan: null }))}
                className="font-medium text-blue-700 hover:underline"
              >
                Split evenly
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Week of</th>
                <th className="px-3 py-2 text-right font-medium">Capacity</th>
                <th className="px-3 py-2 text-right font-medium">Already committed</th>
                <th className="px-3 py-2 text-right font-medium" title="Capacity minus work already committed">Available</th>
                <th className="px-3 py-2 text-right font-medium">This request</th>
                <th className="px-3 py-2 text-right font-medium" title="Available minus this request">Left after</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {weeks.map(w => {
                const available = selected.weeklyCapacity - selected.allocated[w];
                const left = available - (thisLoad.get(w) || 0);
                const over = left < -0.05;
                return (
                  <tr key={w} className={over ? 'bg-red-50' : ''}>
                    <td className="px-3 py-2">{formatWeek(w)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatHours(selected.weeklyCapacity)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatHours(selected.allocated[w])}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${available < -0.05 ? 'text-red-700' : available < 0.05 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {signedHours(available)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={hoursFor(w)}
                        onChange={e => setWeek(w, Math.max(0, Number(e.target.value) || 0))}
                        className="w-20 rounded-md border-gray-300 py-1 text-right text-sm tabular-nums focus:border-blue-500 focus:ring-blue-500"
                        aria-label={`Hours for this request in the week of ${formatWeek(w)}`}
                      />
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${over ? 'font-medium text-red-700' : ''}`}>{signedHours(left)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 text-gray-700">
              {(() => {
                const capacityTotal = selected.weeklyCapacity * weeks.length;
                const committedTotal = weeks.reduce((sum, w) => sum + selected.allocated[w], 0);
                const availableTotal = capacityTotal - committedTotal;
                const leftTotal = availableTotal - (form.estimatedHours || 0);
                return (
                  <tr className="font-medium">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(capacityTotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(committedTotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{signedHours(availableTotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(form.estimatedHours || 0)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${leftTotal < -0.05 ? 'text-red-700' : ''}`}>{signedHours(leftTotal)}</td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      )}

      {overloadedWeeks.length > 0 && (
        <div className="flex gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          <AlertTriangle size={18} className="shrink-0" />
          Committing would put {selected?.name} over capacity in {overloadedWeeks.length} week(s). Consider another owner,
          later dates, a longer duration, or saving it as planned for now.
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Note (optional)</label>
        <input className={inputClass} value={form.note} onChange={e => set('note', e.target.value)} placeholder="Shown in the request history" />
      </div>
      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        {allowPlanned && !underway && request.status !== 'committed' && (
          <button
            type="submit"
            value="plan"
            disabled={!!submitting}
            className="px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 disabled:opacity-60"
            title="Record the owner and dates without allocating capacity"
          >
            {submitting === 'plan' ? 'Saving…' : 'Save as planned'}
          </button>
        )}
        <button type="submit" value="commit" className="btn-primary disabled:opacity-60" disabled={!!submitting}>
          {submitting === 'commit' ? 'Saving…' : underway || request.status === 'committed' ? 'Save changes' : 'Commit'}
        </button>
      </div>
    </form>
  );
};

export default PlanForm;
