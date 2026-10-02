import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ServiceRequest } from '../../types';
import { BOARDS, BoardKey, COMPLETED_WINDOW_DAYS, onBoard } from '../../lib/boards';
import { firestoreDate, STATUS_STYLES } from '../../lib/demand';

const DAY = 86400000;
const TABS = BOARDS.filter(b => b.key !== 'closed');

// Days a request has been in its current status (since it last moved into it)
const daysInStatus = (r: ServiceRequest, now: number) => {
  const entered = [...(r.history || [])].reverse().find(h => h.toStatus === r.status)?.at;
  const since = entered ? new Date(entered).getTime() : firestoreDate(r.createdAt)?.getTime();
  return since ? Math.max(0, (now - since) / DAY) : null;
};

// How much demand is in each stage of the pipeline, one board at a time
const PipelineSummary = ({ requests, onShow }: { requests: ServiceRequest[]; onShow: (title: string, items: ServiceRequest[]) => void }) => {
  const [tab, setTab] = useState<BoardKey>('intake');
  const now = Date.now();
  const stagesFor = (key: BoardKey) =>
    BOARDS.find(b => b.key === key)!.columns.map(status => ({ status, items: requests.filter(r => onBoard(r, status, now)) }));
  const board = TABS.find(b => b.key === tab)!;
  const stages = stagesFor(tab);
  const total = stages.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 border-b border-gray-200">
        <div className="flex gap-1" role="tablist" aria-label="Pipeline">
          {TABS.map(b => {
            const count = stagesFor(b.key).reduce((sum, s) => sum + s.items.length, 0);
            return (
              <button
                key={b.key}
                role="tab"
                aria-selected={tab === b.key}
                onClick={() => setTab(b.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === b.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {b.title}
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs tabular-nums ${tab === b.key ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <Link to="/requests" className="pb-2 text-xs font-medium text-blue-700 hover:underline">Open the board</Link>
      </div>

      <div className="p-4">
        <p className="text-xs text-gray-500 mb-3">{board.subtitle}</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stages.map((s, i) => {
            const label = s.status === 'completed' ? `Completed (${COMPLETED_WINDOW_DAYS} days)` : STATUS_STYLES[s.status].label;
            const urgent = s.items.filter(r => r.priority === 'critical' || r.priority === 'high').length;
            const ages = s.status === 'completed' ? [] : s.items.map(r => daysInStatus(r, now)).filter((d): d is number => d !== null);
            const oldest = ages.length ? Math.max(...ages) : null;
            const share = total ? (s.items.length / total) * 100 : 0;
            return (
              <button
                key={s.status}
                onClick={() => onShow(label, s.items)}
                disabled={s.items.length === 0}
                className="relative text-left p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 hover:border-gray-200 disabled:hover:bg-gray-50 disabled:cursor-default transition-colors"
              >
                {i < stages.length - 1 && (
                  <ChevronRight size={16} className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 text-gray-300" aria-hidden />
                )}
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[s.status].badge}`}>{label}</span>
                <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{s.items.length}</p>
                <div className="mt-2 h-1 rounded-full bg-gray-200 overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${share}%` }} />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {s.items.length === 0
                    ? 'None'
                    : [urgent ? `${urgent} critical/high` : null, oldest !== null ? `oldest ${Math.floor(oldest)}d here` : null].filter(Boolean).join(' · ') ||
                      'Click to see them'}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default PipelineSummary;
