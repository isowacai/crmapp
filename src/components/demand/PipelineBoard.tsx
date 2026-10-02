import { RequestStatus, ServiceRequest } from '../../types';
import { formatHours, STATUS_STYLES } from '../../lib/demand';
import { BOARDS, BoardKey, COMPLETED_WINDOW_DAYS, onBoard } from '../../lib/boards';
import DemandCard from './DemandCard';

const COLUMN_HELP: Partial<Record<RequestStatus, string>> = {
  new: 'Waiting for assessment',
  assessing: 'More information requested',
  approved: 'Accepted; not yet planned',
  planned: 'Owner and dates set; capacity not committed',
  committed: 'Capacity allocated',
  blocked: 'Needs something before it can continue',
  completed: `Last ${COMPLETED_WINDOW_DAYS} days`
};

// One board of the demand pipeline, Kanban style. Cards open the request; moving work between stages
// happens through the request's actions (assess, plan, commit, ...), which need details.
const PipelineBoard = ({
  requests,
  weeklyCapacityByUser,
  board: boardKey,
  supportingCounts,
  hiddenStatuses = [],
  onOpen
}: {
  requests: ServiceRequest[];
  weeklyCapacityByUser: Map<string, number>;
  board: BoardKey;
  supportingCounts: Map<string, number>;
  hiddenStatuses?: RequestStatus[]; // stages the team has switched off (shown anyway if anything is in them)
  onOpen: (id: string) => void;
}) => {
  const now = Date.now();
  const byStatus = (status: RequestStatus) => requests.filter(r => onBoard(r, status, now));
  const hoursOf = (items: ServiceRequest[]) => items.reduce((sum, r) => sum + (r.estimatedHours || 0), 0);

  return (
    <div>
      {BOARDS.filter(b => b.key === boardKey).map(board => {
        const boardItems = board.columns.flatMap(byStatus);
        return (
          <section key={board.key} aria-labelledby={`board-${board.key}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <div>
                <h2 id={`board-${board.key}`} className="text-lg font-semibold">{board.title}</h2>
                <p className="text-sm text-gray-500">{board.subtitle}</p>
              </div>
              <p className="text-sm text-gray-500 tabular-nums">
                {boardItems.length} {boardItems.length === 1 ? 'request' : 'requests'}
                {hoursOf(boardItems) > 0 && ` · ${formatHours(hoursOf(boardItems))} estimated`}
              </p>
            </div>

            {(() => {
              const columns = board.columns.filter(status => !hiddenStatuses.includes(status) || byStatus(status).length > 0);
              return (
            <div className={`grid gap-4 sm:grid-cols-2 ${columns.length === 3 ? 'xl:grid-cols-3' : columns.length === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-4'}`}>
              {columns.map(status => {
                const items = byStatus(status);
                const hours = hoursOf(items);
                return (
                  <div
                    key={status}
                    className={`min-w-0 flex flex-col rounded-xl border max-h-[32rem] ${
                      status === 'blocked' && items.length > 0 ? 'bg-red-50/60 border-red-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
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
                          <DemandCard
                            key={r.id}
                            request={r}
                            ownerWeeklyCapacity={weeklyCapacityByUser.get(r.assigneeId)}
                            supportingCount={supportingCounts.get(r.id) ?? 0}
                            onOpen={onOpen}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
              );
            })()}
          </section>
        );
      })}
    </div>
  );
};

export default PipelineBoard;
