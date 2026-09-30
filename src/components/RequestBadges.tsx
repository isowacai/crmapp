import { Priority, RequestStatus } from '../types';
import { PRIORITY_STYLES, STATUS_STYLES } from '../lib/demand';

export const StatusBadge = ({ status }: { status: RequestStatus }) => (
  <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status].badge}`}>
    {STATUS_STYLES[status].label}
  </span>
);

export const PriorityBadge = ({ priority, long }: { priority: Priority | ''; long?: boolean }) =>
  priority ? (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${PRIORITY_STYLES[priority].badge}`}>
      {long ? PRIORITY_STYLES[priority].label : priority}
    </span>
  ) : (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border border-dashed border-gray-300 text-gray-500">
      Not set
    </span>
  );
