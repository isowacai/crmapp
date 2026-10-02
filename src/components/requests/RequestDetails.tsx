import React, { useMemo, useState } from 'react';
import {
  Play,
  CheckCircle2,
  CalendarCheck,
  ClipboardCheck,
  Ban,
  Clock,
  MessageSquare,
  RotateCcw,
  AlertOctagon,
  Flag,
  CalendarRange,
  PauseCircle,
  UserCog
} from 'lucide-react';
import { Assessment, AssessmentDecision, FieldChange, PriorityLevel, Service, ServiceRequest, Team, User } from '../../types';
import { managesTeam } from '../../lib/roles';
import { formatHours, isOverdue, STATUS_STYLES, toDateKey } from '../../lib/demand';
import { decisionWindow, formatMonth } from '../../lib/forecast';
import CapacityCheck from '../capacity/CapacityCheck';
import { completionWarnings, deliveryHealth, HEALTH_STYLES } from '../../lib/delivery';
import DeliveryPanel, { SupportingRequestInput } from './DeliveryPanel';
import OutcomePanel from './OutcomePanel';
import { evaluateTargets, TargetState } from '../../lib/lifecycle';
import { workflowOf } from '../../lib/workspace';
import { DEFAULT_CURRENCY, formatMoney, MONTHS_PER_YEAR, requestCost, savedHourValue } from '../../lib/value';
import { PRIORITY_LEVELS, PRIORITY_STYLES, teamModel } from '../../lib/priority';
import * as commands from '../../services/requestCommands';
import { PriorityBadge, StatusBadge } from '../RequestBadges';
import PlanForm, { PlanData } from './PlanForm';
import AssessmentForm from './AssessmentForm';

// Persists a validated update built by requestCommands
export type RequestChange = (patch: commands.RequestPatch) => Promise<void>;

type Mode = 'view' | 'assess' | 'plan' | 'priority' | 'target' | 'cancel' | 'block' | 'unblock' | 'log' | 'complete' | 'reopen' | 'comment';
type Tab = 'overview' | 'delivery' | 'assessment' | 'outcome' | 'history';

const TARGET_BADGE: Record<TargetState, { label: string; badge: string }> = {
  met: { label: 'Met', badge: 'bg-emerald-100 text-emerald-800' },
  missed: { label: 'Missed', badge: 'bg-red-100 text-red-800' },
  'on-time': { label: 'On time', badge: 'bg-sky-100 text-sky-800' },
  overdue: { label: 'Overdue', badge: 'bg-amber-100 text-amber-800' }
};

const formatDays = (d: number) => (d < 1 ? `${Math.max(Math.round(d * 24), 1)}h` : `${Math.round(d * 10) / 10}d`);

const inputClass =
  'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  priorityScore: 'Score',
  assigneeName: 'Owner',
  estimatedHours: 'Estimate',
  startDate: 'Planned start',
  dueDate: 'Planned completion',
  targetPeriod: 'Target period'
};

const formatChangeValue = (field: string, value: FieldChange['from']) => {
  if (value === null || value === '') return '—';
  if (field === 'status') return STATUS_STYLES[value as keyof typeof STATUS_STYLES]?.label ?? String(value);
  if (field === 'priority') return PRIORITY_STYLES[value as PriorityLevel]?.label ?? String(value);
  if (field === 'estimatedHours') return formatHours(Number(value));
  if (field === 'targetPeriod') return formatMonth(String(value));
  return String(value);
};

const DECISION_BADGE: Record<Assessment['decision'], { label: string; badge: string }> = {
  accept: { label: 'Accepted', badge: 'bg-emerald-100 text-emerald-800' },
  'more-info': { label: 'More information requested', badge: 'bg-violet-100 text-violet-800' },
  defer: { label: 'Deferred', badge: 'bg-amber-100 text-amber-800' },
  decline: { label: 'Declined', badge: 'bg-gray-200 text-gray-700' }
};

// Small form used by cancel / block / log / complete / reopen / comment
const ActionForm = ({
  label,
  submitLabel,
  requireNote,
  withHours,
  requireHours,
  danger,
  onSubmit,
  onCancel
}: {
  label: string;
  submitLabel: string;
  requireNote?: boolean;
  withHours?: boolean;
  requireHours?: boolean;
  danger?: boolean;
  onSubmit: (note: string, hours: number) => Promise<void>;
  onCancel: () => void;
}) => {
  const [note, setNote] = useState('');
  const [hours, setHours] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(note.trim(), hours);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-gray-50 rounded-lg">
      {withHours && (
        <div>
          <label className="block text-sm font-medium text-gray-700">Hours worked{requireHours ? '' : ' (optional)'}</label>
          <input
            type="number"
            min={requireHours ? 0.25 : 0}
            step={0.25}
            className={inputClass}
            value={hours || ''}
            onChange={e => setHours(Number(e.target.value))}
            required={requireHours}
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <textarea className={inputClass} rows={2} value={note} onChange={e => setNote(e.target.value)} required={requireNote} />
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Back
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-60 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
};

// Manager-assigned priority, with a required reason
const PriorityOverrideForm = ({
  request,
  onSubmit,
  onCancel
}: {
  request: ServiceRequest;
  onSubmit: (level: PriorityLevel | null, reason: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const [level, setLevel] = useState<PriorityLevel | ''>(request.priorityOverride?.level ?? '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const run = async (value: PriorityLevel | null) => {
    setSubmitting(true);
    try {
      await onSubmit(value, reason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (level) run(level); }}
      className="space-y-3 p-4 bg-gray-50 rounded-lg"
    >
      <p className="text-sm text-gray-600">
        Calculated priority:{' '}
        {request.calculatedPriority ? (
          <strong>{PRIORITY_STYLES[request.calculatedPriority].label} ({request.priorityScore}/100)</strong>
        ) : (
          'not assessed yet'
        )}
        . A manager priority replaces it until cleared.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Manager priority</label>
          <select className={inputClass} value={level} onChange={e => setLevel(e.target.value as PriorityLevel)} required>
            <option value="">Select…</option>
            {PRIORITY_LEVELS.map(l => <option key={l} value={l}>{PRIORITY_STYLES[l].label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Reason</label>
          <input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} required />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Back
        </button>
        {request.priorityOverride && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => run(null)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Clear manager priority
          </button>
        )}
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-60">
          Set priority
        </button>
      </div>
    </form>
  );
};

// Move approved/planned demand to another month, with an optional reason
const TargetPeriodForm = ({
  request,
  onSubmit,
  onCancel
}: {
  request: ServiceRequest;
  onSubmit: (period: string, reason: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const [period, setPeriod] = useState(request.targetPeriod || toDateKey(new Date()).slice(0, 7));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <form
      onSubmit={async e => {
        e.preventDefault();
        setSubmitting(true);
        try {
          await onSubmit(period, reason);
        } finally {
          setSubmitting(false);
        }
      }}
      className="space-y-3 p-4 bg-gray-50 rounded-lg"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Target period</label>
          <input type="month" className={inputClass} value={period} onChange={e => setPeriod(e.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Reason (optional)</label>
          <input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. No capacity in November" />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Back
        </button>
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-60">Change target period</button>
      </div>
    </form>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
    <dd className="mt-1 text-sm text-gray-900">{children || '—'}</dd>
  </div>
);

const ActionButton = ({ icon: Icon, label, onClick, tone = 'default' }: {
  icon: typeof Play;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'danger';
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
      tone === 'primary'
        ? 'bg-blue-600 text-white hover:bg-blue-700'
        : tone === 'danger'
        ? 'text-red-700 bg-red-50 hover:bg-red-100'
        : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
    }`}
  >
    <Icon size={16} /> {label}
  </button>
);

const AssessmentCard = ({ a }: { a: Assessment }) => (
  <div className="rounded-lg border border-gray-200 p-4 space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${DECISION_BADGE[a.decision].badge}`}>{DECISION_BADGE[a.decision].label}</span>
      {a.calculatedPriority && <PriorityBadge priority={a.calculatedPriority} score={a.score} />}
      <span className="text-xs text-gray-500 ml-auto">{a.byName} · {new Date(a.at).toLocaleString()}</span>
    </div>
    {a.criteria.length > 0 && Object.keys(a.scores).length > 0 && (
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
        {a.criteria.map(c => (
          <div key={c.key} className="flex justify-between gap-2">
            <dt className="text-gray-600 truncate">{c.label}</dt>
            <dd className="font-medium tabular-nums">{a.scores[c.key] ?? '—'}<span className="text-gray-400">/{c.max}</span></dd>
          </div>
        ))}
      </dl>
    )}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
      <div><span className="text-gray-500">Estimate:</span> {a.estimatedHours ? formatHours(a.estimatedHours) : '—'}</div>
      <div className="sm:col-span-2"><span className="text-gray-500">Dependencies:</span> {a.dependencies || '—'}</div>
      {a.revisitOn && <div><span className="text-gray-500">Revisit on:</span> {a.revisitOn}</div>}
    </div>
    {a.comments && <p className="text-sm text-gray-700 whitespace-pre-wrap">{a.comments}</p>}
  </div>
);

const RequestDetails = ({
  request,
  service,
  services,
  team,
  currentUser,
  users,
  requests,
  onChange,
  onCreateSupporting,
  onOpenRequest
}: {
  request: ServiceRequest;
  service?: Service;
  services: Service[]; // services the viewer can raise supporting requests for
  team?: Team;
  currentUser: User;
  users: User[];
  requests: ServiceRequest[];
  onChange: RequestChange;
  onCreateSupporting: (input: SupportingRequestInput) => Promise<void>;
  onOpenRequest: (id: string) => void;
}) => {
  const [mode, setMode] = useState<Mode>('view');
  const [assessDecision, setAssessDecision] = useState<AssessmentDecision>('accept');
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);

  const isManager = managesTeam(currentUser, request.teamId);
  const isAssignee = request.assigneeId === currentUser.id;
  const isRequester = request.requesterId === currentUser.id;
  const canWork = isAssignee || isManager;
  const s = request.status;
  const workflow = workflowOf(team);
  const model = { ...teamModel(team), workflow };
  const actor: commands.Actor = { id: currentUser.id, name: currentUser.displayName };
  const teamUsers = useMemo(() => users.filter(u => u.teamId === request.teamId), [users, request.teamId]);
  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const currency = team?.currency || DEFAULT_CURRENCY;
  const hourValue = savedHourValue(team);
  const cost = requestCost(request, usersById, team);
  const targetResults = evaluateTargets(request, team?.serviceTargets);
  const openAssess = (decision: AssessmentDecision = 'accept') => {
    setAssessDecision(decision);
    setTab('overview');
    setMode('assess');
  };

  // Builds the update with requestCommands (which validates it) and saves it
  const run = async (build: () => commands.RequestPatch) => {
    try {
      setError(null);
      await onChange(build());
      setMode('view');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the request');
    }
  };

  const handlePlan = (data: PlanData) =>
    run(() => {
      const assignee = users.find(u => u.id === data.assigneeId);
      if (!assignee) throw new commands.RequestRuleError('Please choose a delivery owner.');
      return commands.plan(request, { ...data, assignee, workflow }, actor);
    });

  const actions: React.ReactNode[] = [];
  if (isManager && commands.ASSESSABLE.includes(s)) {
    const first = s === 'new' || s === 'assessing';
    actions.push(<ActionButton key="assess" icon={ClipboardCheck} label={first ? 'Assess' : 'Reassess'} tone={first ? 'primary' : 'default'} onClick={() => openAssess()} />);
  }
  // Approved/planned demand gets its plan/commit choices next to the capacity check instead
  if (isManager && commands.PLANNABLE.includes(s) && s !== 'approved' && s !== 'planned') {
    actions.push(<ActionButton key="plan" icon={CalendarCheck} label="Re-plan" onClick={() => setMode('plan')} />);
  }
  if (s === 'committed' && canWork) {
    actions.push(<ActionButton key="start" icon={Play} label="Start work" tone="primary" onClick={() => run(() => commands.start(request, actor))} />);
  }
  if (s === 'in-progress' && canWork) {
    actions.push(<ActionButton key="log" icon={Clock} label="Log hours" onClick={() => setMode('log')} />);
    actions.push(<ActionButton key="block" icon={AlertOctagon} label="Blocked" onClick={() => setMode('block')} />);
    actions.push(<ActionButton key="complete" icon={CheckCircle2} label="Complete" tone="primary" onClick={() => setMode('complete')} />);
  }
  if (s === 'blocked' && canWork) {
    actions.push(<ActionButton key="unblock" icon={Play} label="Unblock" tone="primary" onClick={() => setMode('unblock')} />);
    actions.push(<ActionButton key="log" icon={Clock} label="Log hours" onClick={() => setMode('log')} />);
  }
  if (isManager && s !== 'completed' && s !== 'declined' && s !== 'cancelled' && !(s === 'approved' || s === 'planned')) {
    actions.push(<ActionButton key="priority" icon={Flag} label="Set priority" onClick={() => setMode('priority')} />);
  }
  if (commands.CANCELLABLE.includes(s) && (isRequester || isManager)) {
    actions.push(<ActionButton key="cancel" icon={Ban} label="Cancel request" tone="danger" onClick={() => setMode('cancel')} />);
  }
  if (isManager && s === 'deferred') {
    actions.push(<ActionButton key="target" icon={CalendarRange} label="Change target period" onClick={() => setMode('target')} />);
  }
  if (isManager && ['completed', 'declined', 'cancelled', 'deferred'].includes(s)) {
    actions.push(<ActionButton key="reopen" icon={RotateCcw} label="Reopen" onClick={() => setMode('reopen')} />);
  }
  if (isManager || isAssignee || isRequester) {
    actions.push(<ActionButton key="comment" icon={MessageSquare} label={s === 'assessing' && isRequester ? 'Reply with information' : 'Comment'} onClick={() => setMode('comment')} />);
  }

  const latestAssessment = request.assessments?.at(-1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={s} />
        <PriorityBadge priority={request.priority} overridden={!!request.priorityOverride} score={request.priorityScore} />
        {isOverdue(request) && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-600 text-white">Overdue</span>}
        {(() => {
          const health = deliveryHealth(request);
          return health && health !== 'done' && !isOverdue(request) ? (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${HEALTH_STYLES[health].badge}`}>{HEALTH_STYLES[health].label}</span>
          ) : null;
        })()}
        <span className="text-xs text-gray-500 ml-auto">{request.teamName}</span>
      </div>

      {s === 'assessing' && latestAssessment?.decision === 'more-info' && (
        <div className="p-3 rounded-lg bg-violet-50 text-violet-900 text-sm">
          <strong>More information requested:</strong> {latestAssessment.comments}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200">
        {([
          ['overview', 'Overview'],
          ['delivery', 'Delivery'],
          ['outcome', request.outcome ? 'Outcome ✓' : 'Outcome'],
          ['assessment', `Assessment${request.assessments?.length ? ` (${request.assessments.length})` : ''}`],
          ['history', 'History']
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {request.parentId && (
            <p className="text-sm text-indigo-900 bg-indigo-50 rounded-lg px-3 py-2">
              Supporting request for <strong>{request.parentNumber}</strong> · {request.parentTitle} ({request.parentTeamName})
            </p>
          )}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Service">{request.serviceName}</Field>
            {request.lineOfBusiness && <Field label="Line of business">{request.lineOfBusiness}</Field>}
            {request.expectedBenefit?.hoursSavedPerMonth ? (
              <Field label="Expected benefit">
                {formatHours(request.expectedBenefit.hoursSavedPerMonth)} saved / month
                {hourValue !== null && (
                  <span className="block text-xs text-gray-500">
                    ≈ {formatMoney(request.expectedBenefit.hoursSavedPerMonth * MONTHS_PER_YEAR * hourValue, currency)} a year
                  </span>
                )}
              </Field>
            ) : null}
            <Field label="Requester">{request.requesterName}{request.requesterTeam ? ` · ${request.requesterTeam}` : ''}</Field>
            <Field label="Requested completion">{request.neededBy}</Field>
            <Field label="Priority">
              {request.priority ? (
                <>
                  {PRIORITY_STYLES[request.priority].label}
                  {request.priorityOverride ? (
                    <span className="block text-xs text-gray-500">
                      Manager: {request.priorityOverride.reason}
                      {request.calculatedPriority && ` (calculated ${PRIORITY_STYLES[request.calculatedPriority].label}, ${request.priorityScore}/100)`}
                    </span>
                  ) : (
                    request.priorityScore !== null && <span className="text-gray-500"> · {request.priorityScore}/100</span>
                  )}
                </>
              ) : 'Not assessed'}
            </Field>
            <Field label="Delivery owner">{request.assigneeName}</Field>
            <Field label="Planned">{request.startDate && `${request.startDate} → ${request.dueDate}`}</Field>
            <Field label="Target period">{formatMonth(request.targetPeriod)}</Field>
            <Field label="Committed">
              {request.committedAt
                ? <>{new Date(request.committedAt).toLocaleDateString()}<span className="block text-xs text-gray-500">{formatHours(request.estimatedHours)} capacity allocated</span></>
                : ''}
            </Field>
            <Field label="Effort (logged / est.)">
              {request.estimatedHours ? `${formatHours(request.loggedHours)} / ${formatHours(request.estimatedHours)}` : formatHours(request.loggedHours)}
            </Field>
            <Field label="Category">{service?.category ?? request.category}</Field>
            <Field label="Dependencies">{latestAssessment?.dependencies}</Field>
          </dl>

          {targetResults.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Service targets</h3>
              <div className="flex flex-wrap gap-2">
                {targetResults.map(t => (
                  <span key={t.key} className={`px-2.5 py-1 rounded-full text-xs font-medium ${TARGET_BADGE[t.state].badge}`} title={`Target ${t.targetDays}d`}>
                    {t.label}: {TARGET_BADGE[t.state].label} · {formatDays(t.actualDays)} / {t.targetDays}d
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Description</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{request.description}</p>
          </div>
          {request.answers?.length > 0 && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {request.answers.map(a => (
                <div key={a.fieldId}>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{a.label}</dt>
                  <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{a.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Business justification</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{request.businessJustification}</p>
          </div>

          {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

          {mode === 'view' && isManager && (s === 'approved' || s === 'planned') && (() => {
            const window = decisionWindow(request);
            return (
              <div className="space-y-3">
                {request.estimatedHours > 0 && <CapacityCheck
                  request={request}
                  effort={request.estimatedHours}
                  start={window.start}
                  end={window.end}
                  basis={window.basis}
                  teamUsers={teamUsers}
                  requests={requests}
                />}
                <div className="flex flex-wrap gap-2">
                  <ActionButton icon={CalendarCheck} label={s === 'planned' ? 'Commit' : 'Plan / commit'} tone="primary" onClick={() => setMode('plan')} />
                  <ActionButton icon={PauseCircle} label="Defer" onClick={() => openAssess('defer')} />
                  <ActionButton icon={Flag} label="Reprioritize" onClick={() => setMode('priority')} />
                  <ActionButton icon={CalendarRange} label="Change target period" onClick={() => setMode('target')} />
                  <ActionButton icon={UserCog} label="Reassign" onClick={() => setMode('plan')} />
                </div>
                <p className="text-xs text-gray-500">The capacity check informs the decision; nothing is committed until you choose.</p>
              </div>
            );
          })()}

          {mode === 'view' && actions.length > 0 && <div className="flex flex-wrap gap-2">{actions}</div>}

          {mode === 'assess' && (
            <div className="p-4 border border-blue-100 bg-blue-50/40 rounded-lg">
              <AssessmentForm
                request={request}
                criteria={model.criteria}
                thresholds={model.thresholds}
                teamUsers={teamUsers}
                requests={requests}
                initialDecision={assessDecision}
                allowMoreInfo={workflow.useAssessing}
                hourValue={hourValue}
                currency={currency}
                onSubmit={input => run(() => commands.assess(request, input, model, actor))}
                onCancel={() => setMode('view')}
              />
            </div>
          )}
          {mode === 'plan' && (
            <div className="p-4 border border-blue-100 bg-blue-50/40 rounded-lg">
              <PlanForm request={request} users={users} requests={requests} allowPlanned={workflow.usePlanned} onSubmit={handlePlan} onCancel={() => setMode('view')} />
            </div>
          )}
          {mode === 'priority' && (
            <PriorityOverrideForm
              request={request}
              onSubmit={(level, reason) => run(() => commands.overridePriority(request, level, reason, actor))}
              onCancel={() => setMode('view')}
            />
          )}
          {mode === 'target' && (
            <TargetPeriodForm
              request={request}
              onSubmit={(period, reason) => run(() => commands.setTargetPeriod(request, period, reason, actor))}
              onCancel={() => setMode('view')}
            />
          )}
          {mode === 'cancel' && (
            <ActionForm label="Reason for cancelling" submitLabel="Cancel request" requireNote danger
              onSubmit={note => run(() => commands.cancel(request, note, actor))} onCancel={() => setMode('view')} />
          )}
          {mode === 'block' && (
            <ActionForm label="What is blocking the work?" submitLabel="Mark as blocked" requireNote
              onSubmit={note => run(() => commands.block(request, note, actor))} onCancel={() => setMode('view')} />
          )}
          {mode === 'unblock' && (
            <ActionForm label="How was it resolved? (optional)" submitLabel="Unblock"
              onSubmit={note => run(() => commands.unblock(request, note, actor))} onCancel={() => setMode('view')} />
          )}
          {mode === 'log' && (
            <ActionForm label="What was done? (optional)" submitLabel="Log hours" withHours requireHours
              onSubmit={(note, hours) => run(() => commands.logHours(request, hours, note, actor))} onCancel={() => setMode('view')} />
          )}
          {mode === 'complete' && completionWarnings(request, requests).length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 text-amber-900 text-sm">
              <p className="font-medium">Before completing, check:</p>
              <ul className="mt-1 list-disc pl-5">
                {completionWarnings(request, requests).map(w => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}
          {mode === 'complete' && (
            <ActionForm label="Completion notes (optional)" submitLabel="Mark complete" withHours
              onSubmit={(note, hours) => run(() => commands.complete(request, hours, note, actor))} onCancel={() => setMode('view')} />
          )}
          {mode === 'reopen' && (
            <ActionForm label="Why reopen it? (optional)" submitLabel="Reopen"
              onSubmit={note => run(() => commands.reopen(request, note, actor))} onCancel={() => setMode('view')} />
          )}
          {mode === 'comment' && (
            <ActionForm label="Comment" submitLabel="Add comment" requireNote
              onSubmit={note => run(() => commands.comment(request, note, actor))} onCancel={() => setMode('view')} />
          )}
        </>
      )}

      {tab === 'delivery' && (
        <>
          {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}
          <DeliveryPanel
            request={request}
            requests={requests}
            services={services}
            actor={actor}
            canWork={canWork}
            isManager={isManager}
            run={run}
            cost={cost}
            currency={currency}
            onCreateSupporting={onCreateSupporting}
            onOpenRequest={onOpenRequest}
          />
        </>
      )}

      {tab === 'outcome' && (
        <>
          {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}
          <OutcomePanel request={request} canEdit={isManager} currency={currency} hourValue={hourValue} actor={actor} run={run} />
        </>
      )}

      {tab === 'assessment' && (
        <div className="space-y-3">
          {request.assessments?.length ? (
            [...request.assessments].reverse().map((a, i) => <AssessmentCard key={`${a.at}-${i}`} a={a} />)
          ) : (
            <p className="text-sm text-gray-500">Not assessed yet.</p>
          )}
        </div>
      )}

      {tab === 'history' && (
        <ol className="relative border-l border-gray-200 ml-2 space-y-4">
          {[...request.history].reverse().map((h, i) => (
            <li key={`${h.at}-${i}`} className="ml-4">
              <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-gray-300" />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-gray-900">{h.action}</span>
                {h.toStatus && <StatusBadge status={h.toStatus} />}
              </div>
              <p className="text-xs text-gray-500">{h.byName} · {new Date(h.at).toLocaleString()}</p>
              {h.changes && h.changes.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                  {h.changes.filter(c => c.field !== 'status').map(c => (
                    <li key={c.field}>
                      <span className="text-gray-500">{FIELD_LABELS[c.field] ?? c.field}:</span>{' '}
                      <span className="line-through text-gray-400">{formatChangeValue(c.field, c.from)}</span>
                      {' → '}
                      <span className="font-medium text-gray-800">{formatChangeValue(c.field, c.to)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {h.note && <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{h.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default RequestDetails;
