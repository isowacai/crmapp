import { PriorityLevel, RequestStatus } from '../types';
import { STATUS_STYLES } from '../lib/demand';
import { PRIORITY_STYLES } from '../lib/priority';

export const StatusBadge = ({ status }: { status: RequestStatus }) => (
  <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status]?.badge ?? 'bg-gray-100 text-gray-700'}`}>
    {STATUS_STYLES[status]?.label ?? status}
  </span>
);

// `overridden` marks a manager-assigned priority (vs. the calculated one)
export const PriorityBadge = ({ priority, overridden, score }: { priority: PriorityLevel | ''; overridden?: boolean; score?: number | null }) =>
  priority ? (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${PRIORITY_STYLES[priority].badge}`}
      title={overridden ? 'Set by a manager' : score != null ? `Calculated score ${score}/100` : undefined}
    >
      {PRIORITY_STYLES[priority].label}
      {score != null && !overridden && <span className="opacity-70 tabular-nums">· {score}</span>}
      {overridden && <span className="opacity-70">· manager</span>}
    </span>
  ) : (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border border-dashed border-gray-300 text-gray-500">
      Not assessed
    </span>
  );
