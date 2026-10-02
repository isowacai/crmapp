import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Link2, X, CornerDownRight, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { DependencyRef, Service, ServiceRequest } from '../../types';
import { formatHours, isOpen } from '../../lib/demand';
import { blockedHours, deliveryHealth, effortVariance, HEALTH_STYLES, milestoneProgress, rollup } from '../../lib/delivery';
import * as commands from '../../services/requestCommands';
import { formatMoney, RequestCost } from '../../lib/value';
import { StatusBadge } from '../RequestBadges';

const inputClass = 'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm';
const DELIVERING = ['committed', 'in-progress', 'blocked'];

const formatDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString() : '—');
const formatDuration = (hours: number) => (hours < 24 ? `${Math.max(Math.round(hours), 1)}h` : `${Math.round(hours / 24)}d`);

const Section = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

export interface SupportingRequestInput {
  serviceId: string; // routed to a delivering team by the original's line of business
  title: string;
  description: string;
  neededBy: string;
}

// Delivery tracking, dependencies, and cross-team supporting requests for one request
const DeliveryPanel = ({
  request: r,
  requests,
  services,
  actor,
  cost,
  currency,
  canWork,
  isManager,
  run,
  onCreateSupporting,
  onOpenRequest
}: {
  request: ServiceRequest;
  requests: ServiceRequest[];
  services: Service[]; // services that can take supporting requests
  actor: commands.Actor; // the signed-in user, recorded on every change
  cost: RequestCost; // nulls when no rates are configured
  currency: string;
  canWork: boolean; // delivery owner or the team's manager
  isManager: boolean;
  run: (build: () => commands.RequestPatch) => Promise<void>;
  onCreateSupporting: (input: SupportingRequestInput) => Promise<void>;
  onOpenRequest: (id: string) => void;
}) => {
  const [milestone, setMilestone] = useState({ title: '', dueDate: '' });
  const [progress, setProgress] = useState(r.progress || 0);
  const [addingDependency, setAddingDependency] = useState(false);
  const [dependencyId, setDependencyId] = useState('');
  const [supporting, setSupporting] = useState<SupportingRequestInput | null>(null);
  const [supportError, setSupportError] = useState<string | null>(null);

  const health = deliveryHealth(r);
  const variance = effortVariance(r);
  const ms = milestoneProgress(r);
  const delivering = DELIVERING.includes(r.status);
  const byId = useMemo(() => new Map(requests.map(x => [x.id, x])), [requests]);
  const up = rollup(r, requests);

  const dependencyOptions = requests
    .filter(x => x.id !== r.id && !r.dependsOn.some(d => d.id === x.id) && x.status !== 'declined' && x.status !== 'cancelled')
    .sort((a, b) => a.requestNumber.localeCompare(b.requestNumber));

  const ref = (x: ServiceRequest): DependencyRef => ({ id: x.id, requestNumber: x.requestNumber, title: x.title });

  return (
    <div className="space-y-6">
      {/* Part of another team's demand */}
      {r.parentId && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-indigo-50 text-indigo-900 text-sm">
          <CornerDownRight size={16} className="mt-0.5 shrink-0" />
          <div>
            Supporting request for <strong>{r.parentNumber}</strong> · {r.parentTitle} ({r.parentTeamName}).
            {byId.has(r.parentId) && (
              <button onClick={() => onOpenRequest(r.parentId)} className="ml-2 underline font-medium">Open it</button>
            )}
          </div>
        </div>
      )}

      <Section title="Delivery">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-xs text-gray-500">Health</dt>
            <dd className="mt-1">
              {health ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${HEALTH_STYLES[health].badge}`}>{HEALTH_STYLES[health].label}</span> : 'Not committed yet'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Planned</dt>
            <dd className="mt-1">{r.startDate ? `${r.startDate} → ${r.dueDate}` : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Actual</dt>
            <dd className="mt-1">{r.actualStart ? `${formatDate(r.actualStart)} → ${r.completedAt ? formatDate(r.completedAt) : 'ongoing'}` : 'Not started'}</dd>
          </div>
          {(cost.estimated !== null || cost.actual !== null) && (
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-xs text-gray-500">Cost (actual / estimate)</dt>
              <dd className="mt-1 tabular-nums">
                {cost.actual !== null ? formatMoney(cost.actual, currency) : '—'} / {cost.estimated !== null ? formatMoney(cost.estimated, currency) : '—'}
                {cost.variance !== null && Math.round(cost.variance) !== 0 && (
                  <span className={`ml-2 text-xs ${cost.variance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {cost.variance > 0 ? '+' : '−'}{formatMoney(Math.abs(cost.variance), currency)} vs estimate
                  </span>
                )}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-gray-500">Effort (actual / estimate)</dt>
            <dd className="mt-1 tabular-nums">
              {formatHours(r.loggedHours)} / {r.estimatedHours ? formatHours(r.estimatedHours) : '—'}
              {variance !== null && variance !== 0 && (
                <span className={`block text-xs ${variance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {variance > 0 ? '+' : ''}{formatHours(variance)} vs estimate
                </span>
              )}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title={`Progress · ${r.progress || 0}%`}>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${r.progress || 0}%` }} />
        </div>
        {canWork && delivering && (
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={e => setProgress(Number(e.target.value))}
              className="flex-1 min-w-[10rem]"
              aria-label="Progress"
            />
            <span className="w-12 text-sm tabular-nums">{progress}%</span>
            <button
              disabled={progress === (r.progress || 0)}
              onClick={() => run(() => commands.setProgress(r, progress, '', actor))}
              className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50"
            >
              Update progress
            </button>
          </div>
        )}
      </Section>

      <Section title={`Milestones${ms.total ? ` · ${ms.done}/${ms.total} done` : ''}`}>
        {r.milestones.length === 0 ? (
          <p className="text-sm text-gray-500">No milestones.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
            {r.milestones.map(m => {
              const overdue = !m.done && m.dueDate && m.dueDate < new Date().toISOString().slice(0, 10);
              return (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={m.done}
                    disabled={!canWork}
                    onChange={e => run(() => commands.setMilestoneDone(r, m.id, e.target.checked, actor))}
                    className="rounded"
                    aria-label={`${m.title} done`}
                  />
                  <span className={`flex-1 ${m.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{m.title}</span>
                  <span className={`text-xs tabular-nums ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    {m.done ? `done ${formatDate(m.doneAt)}` : m.dueDate ? `due ${m.dueDate}` : ''}
                  </span>
                  {isManager && (
                    <button onClick={() => run(() => commands.removeMilestone(r, m.id, actor))} className="p-1 text-gray-400 hover:text-red-600" aria-label={`Remove ${m.title}`}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {canWork && !['completed', 'declined', 'cancelled'].includes(r.status) && (
          <form
            onSubmit={async e => {
              e.preventDefault();
              await run(() => commands.addMilestone(r, milestone.title, milestone.dueDate, actor));
              setMilestone({ title: '', dueDate: '' });
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="flex-1 min-w-[12rem] text-xs text-gray-600">
              New milestone
              <input className={inputClass} value={milestone.title} onChange={e => setMilestone(m => ({ ...m, title: e.target.value }))} placeholder="e.g. Design agreed" required />
            </label>
            <label className="text-xs text-gray-600">
              Due (optional)
              <input type="date" className={inputClass} value={milestone.dueDate} max={r.dueDate || undefined} onChange={e => setMilestone(m => ({ ...m, dueDate: e.target.value }))} />
            </label>
            <button type="submit" className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              <Plus size={14} /> Add
            </button>
          </form>
        )}
      </Section>

      <Section title="Blockers">
        {r.blockers.length === 0 ? (
          <p className="text-sm text-gray-500">Never blocked.</p>
        ) : (
          <ul className="space-y-2">
            {[...r.blockers].reverse().map(b => (
              <li key={b.id} className={`rounded-lg border p-3 text-sm ${b.resolvedAt ? 'border-gray-100' : 'border-red-200 bg-red-50'}`}>
                <div className="flex items-start gap-2">
                  {b.resolvedAt ? <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" /> : <AlertOctagon size={16} className="text-red-600 mt-0.5 shrink-0" />}
                  <div className="flex-1">
                    <p className="text-gray-900">{b.description}</p>
                    <p className="text-xs text-gray-500">
                      Raised by {b.raisedByName} {formatDate(b.raisedAt)} ·{' '}
                      {b.resolvedAt ? `resolved after ${formatDuration(blockedHours(b))}${b.resolution ? `: ${b.resolution}` : ''}` : `open for ${formatDuration(blockedHours(b))}`}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Depends on"
        action={isManager && isOpen(r) && !addingDependency && (
          <button onClick={() => setAddingDependency(true)} className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
            <Link2 size={14} /> Add dependency
          </button>
        )}
      >
        {r.dependsOn.length === 0 && !addingDependency && <p className="text-sm text-gray-500">No dependencies.</p>}
        {r.dependsOn.length > 0 && (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
            {r.dependsOn.map(d => {
              const live = byId.get(d.id);
              return (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <button onClick={() => live && onOpenRequest(d.id)} disabled={!live} className="flex-1 text-left min-w-0">
                    <span className="font-mono text-xs text-gray-500">{d.requestNumber}</span>{' '}
                    <span className="text-gray-800">{d.title}</span>
                    {live && <span className="text-xs text-gray-500"> · {live.teamName}</span>}
                  </button>
                  {live ? <StatusBadge status={live.status} /> : <span className="text-xs text-gray-400">not visible to you</span>}
                  {isManager && isOpen(r) && (
                    <button
                      onClick={() => run(() => commands.setDependencies(r, r.dependsOn.filter(x => x.id !== d.id), requests, actor))}
                      className="p-1 text-gray-400 hover:text-red-600"
                      aria-label={`Remove dependency ${d.requestNumber}`}
                    >
                      <X size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {addingDependency && (
          <form
            onSubmit={async e => {
              e.preventDefault();
              const target = byId.get(dependencyId);
              if (!target) return;
              await run(() => commands.setDependencies(r, [...r.dependsOn, ref(target)], requests, actor));
              setDependencyId('');
              setAddingDependency(false);
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="flex-1 min-w-[16rem] text-xs text-gray-600">
              Request this depends on
              <select className={inputClass} value={dependencyId} onChange={e => setDependencyId(e.target.value)} required>
                <option value="">Select a request</option>
                {dependencyOptions.map(x => (
                  <option key={x.id} value={x.id}>{x.requestNumber} · {x.title} ({x.teamName})</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setAddingDependency(false)} className="px-3 py-2 text-sm text-gray-600">Cancel</button>
            <button type="submit" className="btn-primary text-sm">Add</button>
          </form>
        )}
      </Section>

      {!r.parentId && (
        <Section
          title={`Supporting requests${up.children.length ? ` · ${up.done}/${up.children.length} done` : ''}`}
          action={isManager && isOpen(r) && !supporting && (
            <button
              onClick={() => { setSupportError(null); setSupporting({ serviceId: '', title: '', description: '', neededBy: r.dueDate || r.neededBy || '' }); }}
              className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
            >
              <Plus size={14} /> Request from another team
            </button>
          )}
        >
          {up.children.length === 0 && !supporting && (
            <p className="text-sm text-gray-500">None. Add one when this needs work from another team (e.g. a security review).</p>
          )}
          {up.teams.length > 0 && <p className="text-xs text-gray-500">Supporting teams: {up.teams.join(', ')}{up.blocked ? ` · ${up.blocked} blocked` : ''}</p>}
          {up.children.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {up.children.map(c => (
                <li key={c.id}>
                  <button onClick={() => onOpenRequest(c.id)} className="w-full flex flex-wrap items-center gap-3 px-3 py-2 text-sm text-left hover:bg-gray-50">
                    <span className="flex-1 min-w-0">
                      <span className="font-mono text-xs text-gray-500">{c.requestNumber}</span>{' '}
                      <span className="text-gray-800">{c.serviceName}</span>
                      <span className="block text-xs text-gray-500">{c.teamName} · {c.assigneeName || 'no owner yet'}{c.dueDate ? ` · due ${c.dueDate}` : ''}</span>
                    </span>
                    <StatusBadge status={c.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {supporting && (
            <form
              onSubmit={async e => {
                e.preventDefault();
                try {
                  setSupportError(null);
                  await onCreateSupporting(supporting);
                  setSupporting(null);
                } catch (err) {
                  setSupportError(err instanceof Error ? err.message : 'Could not raise the supporting request');
                }
              }}
              className="space-y-3 p-4 bg-gray-50 rounded-lg"
            >
              <p className="text-sm text-gray-600">
                It goes to the delivering team's pipeline as its own request, linked to this one. They assess, plan, and deliver it with their capacity.
              </p>
              <label className="block text-xs text-gray-600">
                Service
                <select className={inputClass} value={supporting.serviceId} onChange={e => setSupporting(s => s && { ...s, serviceId: e.target.value })} required>
                  <option value="">Select a service</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.category} · {s.name}</option>)}
                </select>
              </label>
              <label className="block text-xs text-gray-600">
                What's needed
                <input className={inputClass} value={supporting.title} onChange={e => setSupporting(s => s && { ...s, title: e.target.value })} required maxLength={120} />
              </label>
              <label className="block text-xs text-gray-600">
                Details
                <textarea className={inputClass} rows={3} value={supporting.description} onChange={e => setSupporting(s => s && { ...s, description: e.target.value })} required />
              </label>
              <label className="block text-xs text-gray-600 sm:w-1/2">
                Needed by (optional)
                <input type="date" className={inputClass} value={supporting.neededBy} onChange={e => setSupporting(s => s && { ...s, neededBy: e.target.value })} />
              </label>
              {supportError && <p className="text-sm text-red-600">{supportError}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setSupporting(null)} className="px-3 py-2 text-sm text-gray-600">Cancel</button>
                <button type="submit" className="btn-primary text-sm">Raise supporting request</button>
              </div>
            </form>
          )}
        </Section>
      )}
    </div>
  );
};

export default DeliveryPanel;
