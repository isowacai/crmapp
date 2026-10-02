// Filtering for the Demand page (board and list share these)
import { PriorityLevel, RequestStatus, ServiceRequest } from '../types';
import { compareByUrgency, firestoreDate, toDateKey } from './demand';

export type DemandScope = 'team' | 'mine' | 'assigned';

export interface DemandFilters {
  scope: DemandScope;
  search: string;
  serviceId: string; // '' = any
  status: RequestStatus | 'open' | 'all';
  priority: PriorityLevel | 'none' | 'all';
  ownerId: string; // '' = any, '-' = no owner yet
  requesterId: string;
  teamId: string;
  lineOfBusiness: string; // '' = any
  createdFrom: string; // YYYY-MM-DD
  createdTo: string;
}

export const DEFAULT_FILTERS: DemandFilters = {
  scope: 'team',
  search: '',
  serviceId: '',
  status: 'open',
  priority: 'all',
  ownerId: '',
  requesterId: '',
  teamId: '',
  lineOfBusiness: '',
  createdFrom: '',
  createdTo: ''
};

const OPEN: RequestStatus[] = ['new', 'assessing', 'approved', 'planned', 'committed', 'in-progress', 'blocked'];

// `ignoreStatus` is for the board, which shows every stage as a column
// `teamId`: limit "Team demand" to this team (leads/managers). Supporting requests they can see because
// they own the original stay on the delivering team's board, not theirs.
export const filterDemand = (
  requests: ServiceRequest[],
  f: DemandFilters,
  userId: string,
  { ignoreStatus = false, teamId }: { ignoreStatus?: boolean; teamId?: string } = {}
): ServiceRequest[] => {
  const q = f.search.trim().toLowerCase();
  return requests
    .filter(r =>
      f.scope === 'mine' ? r.requesterId === userId : f.scope === 'assigned' ? r.assigneeId === userId : teamId === undefined || r.teamId === teamId
    )
    .filter(r => !f.serviceId || r.serviceId === f.serviceId)
    .filter(r => !f.teamId || r.teamId === f.teamId)
    .filter(r => !f.lineOfBusiness || (r.lineOfBusiness ?? '') === f.lineOfBusiness)
    .filter(r => !f.requesterId || r.requesterId === f.requesterId)
    .filter(r => !f.ownerId || (f.ownerId === '-' ? !r.assigneeId : r.assigneeId === f.ownerId))
    .filter(r => f.priority === 'all' || (f.priority === 'none' ? !r.priority : r.priority === f.priority))
    .filter(r => ignoreStatus || f.status === 'all' || (f.status === 'open' ? OPEN.includes(r.status) : r.status === f.status))
    .filter(r => {
      if (!f.createdFrom && !f.createdTo) return true;
      const created = firestoreDate(r.createdAt);
      if (!created) return false;
      const key = toDateKey(created);
      return (!f.createdFrom || key >= f.createdFrom) && (!f.createdTo || key <= f.createdTo);
    })
    .filter(r =>
      !q ||
      [r.requestNumber, r.title, r.serviceName, r.requesterName, r.assigneeName, r.teamName, r.lineOfBusiness].some(v => v?.toLowerCase().includes(q))
    )
    .sort(compareByUrgency);
};

// Demand owned by the viewer's team (everything for admins); excludes other teams' supporting
// requests that leads can see because they own the original
export const inViewerTeam = (r: Pick<ServiceRequest, 'teamId'>, viewer: { role?: string; teamId?: string }) =>
  viewer.role === 'admin' || (!!viewer.teamId && r.teamId === viewer.teamId);

export const activeFilterCount = (f: DemandFilters) =>
  [f.search, f.serviceId, f.ownerId, f.requesterId, f.teamId, f.lineOfBusiness, f.createdFrom, f.createdTo].filter(Boolean).length +
  (f.priority !== 'all' ? 1 : 0) +
  (f.status !== 'open' ? 1 : 0);
