import React, { useState } from 'react';
import { Play, Pause, CheckCircle2, UserPlus, XCircle, Ban, Clock, MessageSquare, RotateCcw } from 'lucide-react';
import { RequestHistoryEntry, RequestStatus, Service, ServiceRequest, User } from '../../types';
import { canManageRequests } from '../../lib/roles';
import { computePriority, formatHours, isOverdue } from '../../lib/demand';
import { PriorityBadge, StatusBadge } from '../RequestBadges';
import AssignForm, { AssignData } from './AssignForm';

export type RequestChange = (
  changes: Partial<Omit<ServiceRequest, 'id' | 'createdAt' | 'history'>>,
  entry: Omit<RequestHistoryEntry, 'at' | 'byId' | 'byName'>
) => Promise<void>;

type Mode = 'view' | 'assign' | 'reject' | 'cancel' | 'hold' | 'log' | 'complete' | 'comment';

const inputClass =
  'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';

// Small form used by reject / cancel / hold / log / complete / comment
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

const RequestDetails = ({
  request,
  service,
  currentUser,
  users,
  requests,
  onChange
}: {
  request: ServiceRequest;
  service?: Service;
  currentUser: User;
  users: User[];
  requests: ServiceRequest[];
  onChange: RequestChange;
}) => {
  const [mode, setMode] = useState<Mode>('view');
  const [error, setError] = useState<string | null>(null);

  const isManager = canManageRequests(currentUser.role);
  const isAssignee = request.assigneeId === currentUser.id;
  const isRequester = request.requesterId === currentUser.id;
  const canWork = isAssignee || isManager;
  const s = request.status;

  const run = async (fn: () => Promise<void>) => {
    try {
      setError(null);
      await fn();
      setMode('view');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the request');
    }
  };

  const setStatus = (status: RequestStatus, action: string, note = '', extra: Partial<ServiceRequest> = {}, hours = 0) =>
    run(() => onChange({ status, ...extra }, { action, toStatus: status, ...(note ? { note } : {}), ...(hours ? { hours } : {}) }));

  const handleAssign = (data: AssignData) =>
    run(async () => {
      const assignee = users.find(u => u.id === data.assigneeId);
      const assigneeName = assignee?.displayName || assignee?.email || 'Unknown';
      const reassigning = !!request.assigneeId && request.assigneeId !== data.assigneeId;
      // Keep in-progress / on-hold work in its current state when re-planning
      const status: RequestStatus = s === 'in-progress' || s === 'on-hold' ? s : 'assigned';
      await onChange(
        {
          status,
          assigneeId: data.assigneeId,
          assigneeName,
          assigneeTeam: assignee?.team || '',
          estimatedHours: data.estimatedHours,
          startDate: data.startDate,
          dueDate: data.dueDate,
          impact: data.impact,
          urgency: data.urgency,
          priority: computePriority(data.impact, data.urgency),
          assignedAt: request.assignedAt || new Date().toISOString()
        },
        {
          action: `${reassigning ? 'Reassigned' : request.assigneeId ? 'Re-planned for' : 'Assigned to'} ${assigneeName} · ${formatHours(data.estimatedHours)} · ${data.startDate} → ${data.dueDate}`,
          toStatus: status,
          ...(data.note ? { note: data.note } : {})
        }
      );
    });

  const actions: React.ReactNode[] = [];
  if (s === 'submitted' && isManager) {
    actions.push(<ActionButton key="assign" icon={UserPlus} label="Triage & assign" tone="primary" onClick={() => setMode('assign')} />);
    actions.push(<ActionButton key="reject" icon={XCircle} label="Reject" tone="danger" onClick={() => setMode('reject')} />);
  }
  if (s === 'assigned' && canWork) {
    actions.push(<ActionButton key="start" icon={Play} label="Start work" tone="primary" onClick={() => setStatus('in-progress', 'Work started')} />);
  }
  if (s === 'in-progress' && canWork) {
    actions.push(<ActionButton key="log" icon={Clock} label="Log hours" onClick={() => setMode('log')} />);
    actions.push(<ActionButton key="hold" icon={Pause} label="Put on hold" onClick={() => setMode('hold')} />);
    actions.push(<ActionButton key="complete" icon={CheckCircle2} label="Complete" tone="primary" onClick={() => setMode('complete')} />);
  }
  if (s === 'on-hold' && canWork) {
    actions.push(<ActionButton key="resume" icon={Play} label="Resume" tone="primary" onClick={() => setStatus('in-progress', 'Resumed')} />);
  }
  if (['assigned', 'in-progress', 'on-hold'].includes(s) && isManager) {
    actions.push(<ActionButton key="replan" icon={UserPlus} label="Reassign / re-plan" onClick={() => setMode('assign')} />);
  }
  if (['submitted', 'assigned', 'on-hold'].includes(s) && (isRequester || isManager)) {
    actions.push(<ActionButton key="cancel" icon={Ban} label="Cancel request" tone="danger" onClick={() => setMode('cancel')} />);
  }
  if (['completed', 'rejected', 'cancelled'].includes(s) && isManager) {
    actions.push(
      <ActionButton
        key="reopen"
        icon={RotateCcw}
        label="Reopen"
        onClick={() => setStatus(request.assigneeId ? 'assigned' : 'submitted', 'Reopened', '', { completedAt: '' })}
      />
    );
  }
  if (isManager || isAssignee || isRequester) {
    actions.push(<ActionButton key="comment" icon={MessageSquare} label="Comment" onClick={() => setMode('comment')} />);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={s} />
        <PriorityBadge priority={request.priority} long />
        {isOverdue(request) && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-600 text-white">Overdue</span>}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Service">{request.serviceName}</Field>
        <Field label="Category">{request.category}</Field>
        <Field label="Requester">{request.requesterName}{request.requesterTeam ? ` · ${request.requesterTeam}` : ''}</Field>
        <Field label="Needed by">{request.neededBy}</Field>
        <Field label="Impact / urgency">{request.impact ? `${request.impact} / ${request.urgency}` : 'Set at triage'}</Field>
        <Field label="Assignee">{request.assigneeName}{request.assigneeTeam ? ` · ${request.assigneeTeam}` : ''}</Field>
        <Field label="Planned">{request.startDate && `${request.startDate} → ${request.dueDate}`}</Field>
        <Field label="Effort (logged / est.)">
          {request.estimatedHours ? `${formatHours(request.loggedHours)} / ${formatHours(request.estimatedHours)}` : formatHours(request.loggedHours)}
        </Field>
      </dl>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Description</h3>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{request.description}</p>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Business justification</h3>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{request.businessJustification}</p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      {mode === 'view' && actions.length > 0 && <div className="flex flex-wrap gap-2">{actions}</div>}

      {mode === 'assign' && (
        <div className="p-4 border border-blue-100 bg-blue-50/40 rounded-lg">
          <AssignForm
            request={request}
            service={service}
            users={users}
            requests={requests}
            onSubmit={handleAssign}
            onCancel={() => setMode('view')}
          />
        </div>
      )}
      {mode === 'reject' && (
        <ActionForm label="Reason for rejecting (shown to the requester)" submitLabel="Reject request" requireNote danger
          onSubmit={note => setStatus('rejected', 'Rejected', note)} onCancel={() => setMode('view')} />
      )}
      {mode === 'cancel' && (
        <ActionForm label="Reason for cancelling" submitLabel="Cancel request" requireNote danger
          onSubmit={note => setStatus('cancelled', 'Cancelled', note)} onCancel={() => setMode('view')} />
      )}
      {mode === 'hold' && (
        <ActionForm label="Why is it on hold?" submitLabel="Put on hold" requireNote
          onSubmit={note => setStatus('on-hold', 'Put on hold', note)} onCancel={() => setMode('view')} />
      )}
      {mode === 'log' && (
        <ActionForm label="What was done? (optional)" submitLabel="Log hours" withHours requireHours
          onSubmit={(note, hours) => run(() => onChange(
            { loggedHours: request.loggedHours + hours },
            { action: `Logged ${formatHours(hours)}`, hours, ...(note ? { note } : {}) }
          ))}
          onCancel={() => setMode('view')} />
      )}
      {mode === 'complete' && (
        <ActionForm label="Completion notes (optional)" submitLabel="Mark complete" withHours
          onSubmit={(note, hours) => setStatus(
            'completed',
            hours ? `Completed · logged ${formatHours(hours)}` : 'Completed',
            note,
            { completedAt: new Date().toISOString(), loggedHours: request.loggedHours + hours },
            hours
          )}
          onCancel={() => setMode('view')} />
      )}
      {mode === 'comment' && (
        <ActionForm label="Comment" submitLabel="Add comment" requireNote
          onSubmit={note => run(() => onChange({}, { action: 'Comment', note }))} onCancel={() => setMode('view')} />
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">History</h3>
        <ol className="relative border-l border-gray-200 ml-2 space-y-4">
          {[...request.history].reverse().map((h, i) => (
            <li key={`${h.at}-${i}`} className="ml-4">
              <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-gray-300" />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-gray-900">{h.action}</span>
                {h.toStatus && <StatusBadge status={h.toStatus} />}
              </div>
              <p className="text-xs text-gray-500">{h.byName} · {new Date(h.at).toLocaleString()}</p>
              {h.note && <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{h.note}</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

export default RequestDetails;
