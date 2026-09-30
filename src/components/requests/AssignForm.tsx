import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Impact, Service, ServiceRequest, Urgency, User } from '../../types';
import {
  allocateByWeek,
  buildCapacity,
  computePriority,
  formatHours,
  formatWeek,
  parseDateKey,
  PRIORITY_STYLES,
  startOfWeek,
  toDateKey,
  utilization,
  weekKeys
} from '../../lib/demand';

export interface AssignData {
  assigneeId: string;
  estimatedHours: number;
  startDate: string;
  dueDate: string;
  impact: Impact;
  urgency: Urgency;
  note: string;
}

// Impact and urgency start blank on a new request and must be chosen during triage
type AssignFormState = Omit<AssignData, 'impact' | 'urgency'> & { impact: Impact | ''; urgency: Urgency | '' };

const inputClass =
  'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

const IMPACT_HELP: Record<Impact, string> = {
  high: 'Many people, a whole team, or a critical process is affected',
  medium: 'A few people or a non-critical process is affected',
  low: 'One person, or a nice-to-have improvement'
};

const URGENCY_HELP: Record<Urgency, string> = {
  high: 'Work is blocked or a hard deadline is imminent',
  medium: 'Needed soon; a workaround exists',
  low: 'No time pressure'
};

const AssignForm = ({
  request,
  service,
  users,
  requests,
  onSubmit,
  onCancel
}: {
  request: ServiceRequest;
  service?: Service;
  users: User[];
  requests: ServiceRequest[];
  onSubmit: (data: AssignData) => Promise<void>;
  onCancel: () => void;
}) => {
  const today = toDateKey(new Date());
  const defaultStart = request.startDate || today;
  // Default the due date to the requester's needed-by date when it's usable
  const defaultDue = request.dueDate || (request.neededBy && request.neededBy >= defaultStart ? request.neededBy : '');

  const [form, setForm] = useState<AssignFormState>({
    assigneeId: request.assigneeId,
    estimatedHours: request.estimatedHours,
    startDate: defaultStart,
    dueDate: defaultDue,
    impact: request.impact,
    urgency: request.urgency,
    note: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const set = <K extends keyof AssignFormState>(key: K, value: AssignFormState[K]) => setForm(prev => ({ ...prev, [key]: value }));

  // Weeks covered by the planned dates
  const weeks = useMemo(() => {
    const start = parseDateKey(form.startDate || today);
    const end = form.dueDate && form.dueDate >= form.startDate ? parseDateKey(form.dueDate) : start;
    const count = Math.round((startOfWeek(end).getTime() - startOfWeek(start).getTime()) / (7 * 86400000)) + 1;
    return weekKeys(start, Math.min(Math.max(count, 1), 26));
  }, [form.startDate, form.dueDate, today]);

  // Everyone's existing load in those weeks, excluding this request
  const capacity = useMemo(
    () => buildCapacity(users, requests.filter(r => r.id !== request.id), weeks),
    [users, requests, request.id, weeks]
  );

  const thisLoad = allocateByWeek(form);

  const candidates = capacity
    .map(row => {
      const booked = weeks.reduce((sum, w) => sum + row.allocated[w], 0);
      return { ...row, bookedPct: utilization(booked, row.weeklyCapacity * weeks.length) };
    })
    // Delivering team first, then least booked
    .sort((a, b) =>
      Number(b.team === service?.ownerTeam) - Number(a.team === service?.ownerTeam) || a.bookedPct - b.bookedPct
    );

  const selected = capacity.find(c => c.userId === form.assigneeId);
  const overloadedWeeks = selected
    ? weeks.filter(w => selected.allocated[w] + (thisLoad.get(w) || 0) > selected.weeklyCapacity)
    : [];

  const priority = form.impact && form.urgency ? computePriority(form.impact, form.urgency) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.impact || !form.urgency) return; // enforced by the required selects
    setSubmitting(true);
    try {
      await onSubmit({ ...form, impact: form.impact, urgency: form.urgency });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">1. Priority</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
          <div>
            <label className="block text-sm font-medium text-gray-700">Impact</label>
            <select className={inputClass} value={form.impact} onChange={e => set('impact', e.target.value as Impact)} required>
              <option value="">Select…</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            {form.impact && <p className="mt-1 text-xs text-gray-500">{IMPACT_HELP[form.impact]}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Urgency</label>
            <select className={inputClass} value={form.urgency} onChange={e => set('urgency', e.target.value as Urgency)} required>
              <option value="">Select…</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            {form.urgency && <p className="mt-1 text-xs text-gray-500">{URGENCY_HELP[form.urgency]}</p>}
          </div>
          <div className="sm:pt-7">
            {priority ? (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_STYLES[priority].badge}`}>
                {PRIORITY_STYLES[priority].label}
              </span>
            ) : (
              <span className="text-xs text-gray-500">Priority is calculated from impact × urgency</span>
            )}
          </div>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-gray-800 pt-2">2. Plan and assign</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Planned start</label>
          <input type="date" className={inputClass} value={form.startDate} onChange={e => set('startDate', e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Planned due date</label>
          <input
            type="date"
            className={inputClass}
            value={form.dueDate}
            min={form.startDate}
            onChange={e => set('dueDate', e.target.value)}
            required
          />
          {request.neededBy && form.dueDate > request.neededBy && (
            <p className="mt-1 text-xs text-amber-700">Later than the requester's needed-by date ({request.neededBy})</p>
          )}
        </div>
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
      <div>
        <label className="block text-sm font-medium text-gray-700">Assign to</label>
        <select className={inputClass} value={form.assigneeId} onChange={e => set('assigneeId', e.target.value)} required>
          <option value="">Select a person</option>
          {candidates.map(c => (
            <option key={c.userId} value={c.userId}>
              {c.name} · {c.team} · {c.bookedPct}% booked
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          "% booked" is existing planned work in the selected dates. {service?.ownerTeam ? `${service.ownerTeam} is listed first.` : ''}
        </p>
      </div>

      {selected && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Week of</th>
                <th className="px-3 py-2 text-right font-medium">Already planned</th>
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
          {selected?.name} would be over capacity in {overloadedWeeks.length} week(s). Consider another person,
          later dates, or a longer duration.
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Note (optional)</label>
        <input className={inputClass} value={form.note} onChange={e => set('note', e.target.value)} placeholder="Shown in the request history" />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" className="btn-primary disabled:opacity-60" disabled={submitting}>
          {submitting ? 'Saving…' : request.assigneeId ? 'Save changes' : 'Set priority & assign'}
        </button>
      </div>
    </form>
  );
};

export default AssignForm;
