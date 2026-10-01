import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ServiceRequest, User } from '../../types';
import {
  allocateByWeek,
  buildCapacity,
  formatHours,
  formatWeek,
  parseDateKey,
  startOfWeek,
  toDateKey,
  utilization,
  weekKeys
} from '../../lib/demand';

export interface PlanData {
  assigneeId: string;
  estimatedHours: number;
  startDate: string;
  dueDate: string;
  note: string;
  commit: boolean;
}

const inputClass =
  'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

// Owner, estimate, and dates for approved demand, with the owner's existing committed load.
// "Save as planned" records a tentative plan; "Commit" allocates the capacity.
const PlanForm = ({
  request,
  users,
  requests,
  onSubmit,
  onCancel
}: {
  request: ServiceRequest;
  users: User[];
  requests: ServiceRequest[];
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
    note: ''
  });
  const [submitting, setSubmitting] = useState<'plan' | 'commit' | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(prev => ({ ...prev, [key]: value }));

  // Weeks covered by the planned dates
  const weeks = useMemo(() => {
    const start = parseDateKey(form.startDate || today);
    const end = form.dueDate && form.dueDate >= form.startDate ? parseDateKey(form.dueDate) : start;
    const count = Math.round((startOfWeek(end).getTime() - startOfWeek(start).getTime()) / (7 * 86400000)) + 1;
    return weekKeys(start, Math.min(Math.max(count, 1), 26));
  }, [form.startDate, form.dueDate, today]);

  // Everyone's existing committed load in those weeks, excluding this request
  const capacity = useMemo(
    () => buildCapacity(users, requests.filter(r => r.id !== request.id), weeks),
    [users, requests, request.id, weeks]
  );

  const teamMemberIds = useMemo(
    () => new Set(users.filter(u => u.teamId === request.teamId).map(u => u.id)),
    [users, request.teamId]
  );

  const thisLoad = allocateByWeek(form);

  const candidates = capacity
    .map(row => {
      const booked = weeks.reduce((sum, w) => sum + row.allocated[w], 0);
      return { ...row, bookedPct: utilization(booked, row.weeklyCapacity * weeks.length), inTeam: teamMemberIds.has(row.userId) };
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
          <input type="date" className={inputClass} value={form.startDate} onChange={e => set('startDate', e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Planned completion</label>
          <input
            type="date"
            className={inputClass}
            value={form.dueDate}
            min={form.startDate}
            onChange={e => set('dueDate', e.target.value)}
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
            onChange={e => set('estimatedHours', Number(e.target.value))}
            required
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Delivery owner</label>
        <select className={inputClass} value={form.assigneeId} onChange={e => set('assigneeId', e.target.value)} required>
          <option value="">Select a person</option>
          {candidates.map(c => (
            <option key={c.userId} value={c.userId}>
              {c.name} · {c.team} · {c.bookedPct}% committed
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          "% committed" is existing committed work in the selected dates. {request.teamName ? `${request.teamName} is listed first.` : ''}
        </p>
      </div>

      {selected && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Week of</th>
                <th className="px-3 py-2 text-right font-medium">Already committed</th>
                <th className="px-3 py-2 text-right font-medium">+ This request</th>
                <th className="px-3 py-2 text-right font-medium">Capacity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {weeks.map(w => {
                const total = selected.allocated[w] + (thisLoad.get(w) || 0);
                return (
                  <tr key={w} className={total > selected.weeklyCapacity ? 'bg-red-50' : ''}>
                    <td className="px-3 py-2">{formatWeek(w)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(selected.allocated[w])}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(selected.weeklyCapacity)}</td>
                  </tr>
                );
              })}
            </tbody>
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
        {!underway && request.status !== 'committed' && (
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
