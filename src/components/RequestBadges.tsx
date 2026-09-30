import { Priority, RequestStatus } from '../types';
import { PRIORITY_STYLES, STATUS_STYLES } from '../lib/demand';

export const StatusBadge = ({ status }: { status: RequestStatus }) => (
  <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status].badge}`}>
    {STATUS_STYLES[status].label}
  </span>
);

export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${PRIORITY_STYLES[priority].badge}`}>
    {priority}
  </span>
);
