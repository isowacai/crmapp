import { RequestStatus, ServiceRequest } from '../../types';
import { firestoreDate, formatHours, PIPELINE_STAGES, STATUS_STYLES } from '../../lib/demand';
import DemandCard from './DemandCard';

const COMPLETED_WINDOW_DAYS = 30;

// Blocked sits beside In progress; deferred/declined/cancelled only when asked for
const mainColumns = (): RequestStatus[] => {
  const cols = [...PIPELINE_STAGES];
  cols.splice(cols.indexOf('in-progress') + 1, 0, 'blocked');
  return cols;
};
const CLOSED_COLUMNS: RequestStatus[] = ['deferred', 'declined', 'cancelled'];

const COLUMN_HELP: Partial<Record<RequestStatus, string>> = {
  new: 'Waiting for assessment',
  assessing: 'More information requested',
  approved: 'Accepted; not yet planned',
  planned: 'Owner and dates set; capacity not committed',
  committed: 'Capacity allocated',
  completed: `Last ${COMPLETED_WINDOW_DAYS} days`
};

// Kanban-style view of the demand pipeline. Cards open the request; moving work between stages
// happens through the request's actions (assess, plan, commit, ...), which need details.
const PipelineBoard = ({
  requests,
  weeklyCapacityByUser,
  showClosed,
  onOpen
}: {
  requests: ServiceRequest[];
  weeklyCapacityByUser: Map<string, number>;
  showClosed: boolean;
  onOpen: (id: string) => void;
}) => {
  const since = Date.now() - COMPLETED_WINDOW_DAYS * 86400000;
  const columns = showClosed ? [...mainColumns(), ...CLOSED_COLUMNS] : mainColumns();

  const byStatus = (status: RequestStatus) =>
    requests.filter(
      r => r.status === status && (status !== 'completed' || (firestoreDate(r.completedAt)?.getTime() ?? 0) >= since)
    );

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
      {columns.map(status => {
        const items = byStatus(status);
        const hours = items.reduce((sum, r) => sum + (r.estimatedHours || 0), 0);
        return (
          <section key={status} className="w-72 shrink-0 flex flex-col rounded-xl bg-gray-50 border border-gray-200 max-h-[calc(100vh-18rem)]">
            <header className="px-3 pt-3 pb-2">
              <div className="flex items-center justify-between gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status].badge}`}>{STATUS_STYLES[status].label}</span>
                <span className="text-xs text-gray-500 tabular-nums">
                  {items.length}
                  {hours > 0 && ` · ${formatHours(hours)}`}
                </span>
              </div>
              {COLUMN_HELP[status] && <p className="mt-1 text-[11px] text-gray-500">{COLUMN_HELP[status]}</p>}
            </header>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 custom-scrollbar">
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Nothing here</p>
              ) : (
                items.map(r => (
                  <DemandCard key={r.id} request={r} ownerWeeklyCapacity={weeklyCapacityByUser.get(r.assigneeId)} onOpen={onOpen} />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default PipelineBoard;
