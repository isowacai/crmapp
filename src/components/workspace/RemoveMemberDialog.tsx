import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ServiceRequest, User } from '../../types';
import {
  allocateByWeek,
  buildCapacity,
  formatHours,
  planWeeks,
  startOfWeek,
  STATUS_STYLES,
  toDateKey,
  WorkCalendar
} from '../../lib/demand';
import { PRIORITY_STYLES } from '../../lib/priority';
import Modal from '../Modal';

// Work that has an owner and isn't finished
export const ONGOING = ['planned', 'committed', 'in-progress', 'blocked'];
const KEEP = '';

const remaining = (r: ServiceRequest) => Math.max((r.estimatedHours || 0) - (r.loggedHours || 0), 0);

// The weeks still to come for a request: from this week (or its start, if later) to its due date.
// Overdue work only has this week left.
const weeksLeft = (r: ServiceRequest, today: string) => {
  const from = r.startDate && r.startDate > today ? r.startDate : today;
  return r.dueDate && r.dueDate >= from ? planWeeks(from, r.dueDate) : [toDateKey(startOfWeek(new Date()))];
};

// Removing someone from the team: shows their ongoing work and lets the manager hand each item to a
// teammate, with each teammate's free hours over that item's remaining weeks
const RemoveMemberDialog = ({
  person,
  teammates,
  requests,
  calendar,
  onConfirm,
  onClose
}: {
  person: User;
  teammates: User[]; // who the work can go to
  requests: ServiceRequest[];
  calendar: WorkCalendar;
  onConfirm: (assignments: { request: ServiceRequest; to: User }[]) => Promise<void>;
  onClose: () => void;
}) => {
  const today = toDateKey(new Date());
  const work = useMemo(
    () =>
      requests
        .filter(r => r.assigneeId === person.id && ONGOING.includes(r.status))
        .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')),
    [requests, person.id]
  );
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Everyone's existing load over all the weeks involved
  const allWeeks = useMemo(() => [...new Set(work.flatMap(r => weeksLeft(r, today)))].sort(), [work, today]);
  const capacity = useMemo(() => buildCapacity(teammates, requests, allWeeks, calendar), [teammates, requests, allWeeks, calendar]);

  // Free hours a teammate has in a request's remaining weeks, counting the other items handed to them here
  const freeHours = (userId: string, r: ServiceRequest) => {
    const row = capacity.find(c => c.userId === userId);
    if (!row) return 0;
    const weeks = weeksLeft(r, today);
    const extra = new Map<string, number>();
    for (const other of work) {
      if (other.id === r.id || assign[other.id] !== userId) continue;
      for (const [w, h] of allocateByWeek(other, calendar)) extra.set(w, (extra.get(w) || 0) + h);
    }
    return weeks.reduce((sum, w) => sum + Math.max(row.weeklyCapacity - (row.allocated[w] || 0) - (extra.get(w) || 0), 0), 0);
  };

  const assignAll = (userId: string) => setAssign(Object.fromEntries(work.map(r => [r.id, userId])));
  const handedOver = work.filter(r => assign[r.id]);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(handedOver.map(r => ({ request: r, to: teammates.find(t => t.id === assign[r.id])! })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reassign the work');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Remove ${person.displayName} from the team`}
      subtitle={work.length ? `${work.length} ongoing ${work.length === 1 ? 'request' : 'requests'} assigned to them` : 'No ongoing work assigned to them'}
      onClose={onClose}
      width="max-w-4xl"
    >
      <div className="space-y-4">
        {work.length === 0 ? (
          <p className="text-sm text-gray-600">Nothing planned, committed, or in progress is assigned to {person.displayName}.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-600">
                Choose who takes over each request. Free hours are each person's capacity left in that request's remaining weeks, after
                their committed work.
              </p>
              {teammates.length > 0 && (
                <label className="text-xs text-gray-600 flex items-center gap-2">
                  Assign all to
                  <select
                    value=""
                    onChange={e => e.target.value !== '' && assignAll(e.target.value === '-' ? KEEP : e.target.value)}
                    className="rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Choose…</option>
                    {teammates.map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                    <option value="-">Keep all with {person.displayName}</option>
                  </select>
                </label>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left">Request</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Dates</th>
                    <th className="px-3 py-2 text-right">Hours left</th>
                    <th className="px-3 py-2 text-left">Reassign to</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {work.map(r => {
                    const left = remaining(r);
                    const target = assign[r.id] ?? KEEP;
                    const free = target ? freeHours(target, r) : null;
                    const options = teammates
                      .map(t => ({ user: t, free: freeHours(t.id, r) }))
                      .sort((a, b) => b.free - a.free);
                    return (
                      <tr key={r.id} className="align-top">
                        <td className="px-3 py-2">
                          <p className="text-xs font-mono text-gray-500">{r.requestNumber}</p>
                          <p className="font-medium text-gray-900">{r.title}</p>
                          <p className="text-xs text-gray-500">
                            {r.serviceName}
                            {r.lineOfBusiness ? ` · ${r.lineOfBusiness}` : ''}
                            {r.priority ? ` · ${PRIORITY_STYLES[r.priority].label}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status].badge}`}>{STATUS_STYLES[r.status].label}</span>
                          {r.status === 'in-progress' && r.progress > 0 && <p className="mt-1 text-xs text-gray-500">{r.progress}% done</p>}
                        </td>
                        <td className={`px-3 py-2 text-xs whitespace-nowrap ${r.dueDate && r.dueDate < today ? 'text-red-600' : 'text-gray-600'}`}>
                          {r.startDate || '—'} → {r.dueDate || '—'}
                          {r.dueDate && r.dueDate < today && <span className="block">Overdue</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {formatHours(left)}
                          <span className="block text-xs text-gray-500">of {formatHours(r.estimatedHours || 0)}</span>
                        </td>
                        <td className="px-3 py-2 min-w-[16rem]">
                          <select
                            value={target}
                            onChange={e => setAssign(a => ({ ...a, [r.id]: e.target.value }))}
                            className="w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                            aria-label={`Reassign ${r.requestNumber}`}
                          >
                            <option value={KEEP}>Keep with {person.displayName} (decide later)</option>
                            {options.map(o => (
                              <option key={o.user.id} value={o.user.id}>
                                {o.user.displayName} · {formatHours(Math.round(o.free))} free{o.free >= left ? ' · fits' : ''}
                              </option>
                            ))}
                          </select>
                          {free !== null && (
                            <p className={`mt-1 text-xs flex items-center gap-1 ${free >= left ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {free >= left ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                              {free >= left
                                ? `Fits: ${formatHours(Math.round(free))} free for ${formatHours(left)} left`
                                : `Short by ${formatHours(Math.ceil(left - free))}: consider re-planning the dates`}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {teammates.length === 0 && <p className="text-sm text-amber-700">There's no one else on the team to hand the work to.</p>}
            {work.length > handedOver.length && (
              <p className="text-xs text-gray-500">
                {work.length - handedOver.length} {work.length - handedOver.length === 1 ? 'request stays' : 'requests stay'} assigned to{' '}
                {person.displayName} after they leave the team; reassign {work.length - handedOver.length === 1 ? 'it' : 'them'} later from the request.
              </p>
            )}
          </>
        )}

        {error && <p className="p-3 rounded-lg bg-red-50 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={confirm} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60">
            {saving
              ? 'Saving…'
              : handedOver.length
              ? `Reassign ${handedOver.length} and remove ${person.displayName}`
              : `Remove ${person.displayName}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default RemoveMemberDialog;
