import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useWorkCalendar } from '../../hooks/useWorkCalendar';
import { ServiceRequest, User } from '../../types';
import { formatHours, parseDateKey } from '../../lib/demand';
import { checkCapacity } from '../../lib/forecast';

const formatDay = (key: string) => parseDateKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const STATUS = {
  fits: { icon: CheckCircle2, box: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-800', label: 'Fits within available capacity.' },
  tight: { icon: Info, box: 'border-amber-200 bg-amber-50', text: 'text-amber-800', label: 'Fits, but leaves the team with little spare capacity.' },
  insufficient: {
    icon: AlertTriangle,
    box: 'border-red-200 bg-red-50',
    text: 'text-red-800',
    label: 'Insufficient available capacity for the requested period.'
  }
} as const;

// Team-level capacity check for a decision: effort vs. capacity left after committed work in a window.
// It informs the decision; it never makes it.
const CapacityCheck = ({
  request,
  effort,
  start,
  end,
  basis,
  teamUsers,
  requests
}: {
  request: Pick<ServiceRequest, 'id' | 'neededBy' | 'teamName'>;
  effort: number;
  start: string;
  end: string;
  basis: string; // what the window is based on, e.g. "requested completion"
  teamUsers: User[];
  requests: ServiceRequest[];
}) => {
  const calendar = useWorkCalendar();
  if (teamUsers.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Capacity can't be checked: {request.teamName || 'this team'} has no members with capacity set.
      </div>
    );
  }

  const check = checkCapacity({ users: teamUsers, requests, effort, start, end, excludeId: request.id, calendar });
  const style = STATUS[check.status];
  const Icon = style.icon;
  const used = check.available > 0 ? Math.min((check.committed / check.available) * 100, 100) : 100;
  const adds = check.available > 0 ? Math.min((effort / check.available) * 100, 100 - used) : 0;

  return (
    <div className={`rounded-lg border p-4 ${style.box}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">Capacity check · {request.teamName || 'Team'}</p>
        <p className="text-xs text-gray-600">
          {formatDay(check.start)} – {formatDay(check.end)} ({basis})
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
        <div>
          <dt className="text-xs text-gray-600">Estimated effort</dt>
          <dd className="font-semibold tabular-nums">{effort > 0 ? formatHours(effort) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-600">Available capacity</dt>
          <dd className="font-semibold tabular-nums">{formatHours(check.available)}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-600">Already committed</dt>
          <dd className="font-semibold tabular-nums">{formatHours(check.committed)}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-600">Remaining</dt>
          <dd className={`font-semibold tabular-nums ${check.remaining < effort ? 'text-red-700' : ''}`}>{formatHours(Math.max(check.remaining, 0))}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-600">Requested completion</dt>
          <dd className="font-semibold">{request.neededBy ? formatDay(request.neededBy) : '—'}</dd>
        </div>
      </dl>

      {/* Committed (solid) and this request (lighter) as a share of the window's capacity */}
      <div className="mt-3 h-2 rounded-full bg-white overflow-hidden flex" aria-hidden="true">
        <div className="h-full bg-gray-500" style={{ width: `${used}%` }} />
        <div className={`h-full ${check.status === 'insufficient' ? 'bg-red-400' : 'bg-blue-400'}`} style={{ width: `${adds}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-gray-600">Grey: committed · colour: this request</p>

      {effort > 0 && (
        <p className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${style.text}`}>
          <Icon size={16} className="shrink-0" /> {style.label}
          {check.status === 'insufficient' && ` Short by ${formatHours(effort - Math.max(check.remaining, 0))}.`}
        </p>
      )}
    </div>
  );
};

export default CapacityCheck;
