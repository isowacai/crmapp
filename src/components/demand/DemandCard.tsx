import { CalendarClock, Clock, User as UserIcon, Flag, CornerDownRight, GitBranch } from 'lucide-react';
import { ServiceRequest } from '../../types';
import { formatHours, isOverdue } from '../../lib/demand';
import { deliveryHealth, HEALTH_STYLES, milestoneProgress } from '../../lib/delivery';
import { PriorityBadge } from '../RequestBadges';

// A demand item on the pipeline board. `ownerWeeklyCapacity` lets the card show capacity impact.
const DemandCard = ({
  request: r,
  ownerWeeklyCapacity,
  supportingCount = 0,
  onOpen
}: {
  request: ServiceRequest;
  ownerWeeklyCapacity?: number;
  supportingCount?: number; // other teams' requests raised under this one
  onOpen: (id: string) => void;
}) => {
  const health = deliveryHealth(r);
  const ms = milestoneProgress(r);
  const overdue = isOverdue(r);
  const target = r.dueDate || r.neededBy;
  const impactPct = r.estimatedHours && ownerWeeklyCapacity ? Math.round((r.estimatedHours / ownerWeeklyCapacity) * 100) : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(r.id)}
      className={`w-full text-left bg-white rounded-lg border p-3 shadow-sm hover:shadow-md hover:border-blue-300 transition-all ${
        r.status === 'blocked' ? 'border-red-300' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-mono text-gray-500">{r.requestNumber}</span>
        <PriorityBadge priority={r.priority} overridden={!!r.priorityOverride} score={r.priorityScore} />
      </div>
      <p className="mt-1 text-sm font-medium text-gray-900 line-clamp-2">{r.title}</p>
      <p className="text-xs text-gray-500 truncate">{r.serviceName} · {r.requesterName}</p>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
        {r.estimatedHours > 0 && (
          <span className="flex items-center gap-1" title={impactPct !== null ? `${impactPct}% of the owner's weekly capacity` : 'Estimated effort'}>
            <Clock size={12} /> {formatHours(r.estimatedHours)}
            {impactPct !== null && <span className="text-gray-400">· {impactPct}% of a week</span>}
          </span>
        )}
        {target && (
          <span className={`flex items-center gap-1 ${overdue ? 'text-red-600 font-medium' : ''}`} title={r.dueDate ? 'Planned completion' : 'Requested completion'}>
            <CalendarClock size={12} /> {r.dueDate ? '' : 'wanted '}{target}
          </span>
        )}
        {r.assigneeName && (
          <span className="flex items-center gap-1">
            <UserIcon size={12} /> {r.assigneeName}
          </span>
        )}
      </div>
      {(ms.total > 0 || r.parentId || supportingCount > 0 || r.progress > 0) && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
          {r.progress > 0 && r.status !== 'completed' && <span className="tabular-nums">{r.progress}% done</span>}
          {ms.total > 0 && (
            <span className="flex items-center gap-1" title="Milestones done">
              <Flag size={12} /> {ms.done}/{ms.total}
            </span>
          )}
          {r.parentId && (
            <span className="flex items-center gap-1 text-indigo-700" title={`Supporting request for ${r.parentNumber} (${r.parentTeamName})`}>
              <CornerDownRight size={12} /> {r.parentNumber}
            </span>
          )}
          {supportingCount > 0 && (
            <span className="flex items-center gap-1 text-indigo-700" title="Requests raised for other teams">
              <GitBranch size={12} /> {supportingCount} supporting
            </span>
          )}
        </div>
      )}
      {r.status === 'blocked' ? (
        <p className="mt-2 text-xs font-medium text-red-700">Blocked</p>
      ) : (
        (health === 'at-risk' || health === 'late') && !overdue && (
          <span className={`mt-2 inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${HEALTH_STYLES[health].badge}`}>{HEALTH_STYLES[health].label}</span>
        )
      )}
    </button>
  );
};

export default DemandCard;
