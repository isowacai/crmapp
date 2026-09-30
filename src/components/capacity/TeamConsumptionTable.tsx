import React from 'react';
import { formatHours, formatWeek, TeamSummary, UNASSIGNED_TEAM, utilization, utilizationClass } from '../../lib/demand';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

// Teams × weeks heatmap of planned or logged hours as a share of the team's combined capacity
const TeamConsumptionTable = ({
  summaries,
  weeks,
  view,
  thisWeek,
  onSelectTeam,
  teamActions
}: {
  summaries: TeamSummary[];
  weeks: string[];
  view: 'planned' | 'logged';
  thisWeek: string;
  onSelectTeam?: (team: string) => void;
  teamActions?: (team: string) => React.ReactNode; // extra controls beside the team name
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
        <tr>
          <th className="px-4 py-3 text-left font-medium">Team</th>
          <th className="px-4 py-3 text-right font-medium">Period total</th>
          {weeks.map(w => (
            <th key={w} className={`px-2 py-3 text-center font-medium whitespace-nowrap ${w === thisWeek ? 'text-blue-700' : ''}`}>
              {w === thisWeek ? 'This week' : formatWeek(w)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {summaries.length === 0 ? (
          <tr>
            <td colSpan={weeks.length + 2} className="px-4 py-8 text-center text-gray-500">No active users.</td>
          </tr>
        ) : (
          summaries.map(t => {
            const series = view === 'planned' ? t.planned : t.logged;
            const totalHours = sum(weeks.map(w => series[w]));
            const totalCapacity = sum(weeks.map(w => t.capacity[w]));
            return (
              <tr
                key={t.team}
                onClick={onSelectTeam ? () => onSelectTeam(t.team) : undefined}
                className={onSelectTeam ? 'cursor-pointer hover:bg-blue-50/50 transition-colors' : ''}
                title={onSelectTeam ? 'View team details' : undefined}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    {onSelectTeam ? (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onSelectTeam(t.team); }}
                        className={`font-medium hover:underline text-left ${t.team === UNASSIGNED_TEAM ? 'italic text-gray-500' : 'text-blue-700'}`}
                      >
                        {t.team}
                      </button>
                    ) : (
                      <span className={`font-medium ${t.team === UNASSIGNED_TEAM ? 'italic text-gray-500' : ''}`}>{t.team}</span>
                    )}
                    {teamActions?.(t.team)}
                  </div>
                  <div className="text-xs text-gray-500">{t.members} {t.members === 1 ? 'person' : 'people'}</div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                  <div className="font-medium">{utilization(totalHours, totalCapacity)}%</div>
                  <div className="text-xs text-gray-500">{formatHours(totalHours)} / {formatHours(totalCapacity)}</div>
                </td>
                {weeks.map(w => {
                  const pct = utilization(series[w], t.capacity[w]);
                  return (
                    <td key={w} className={`px-2 py-2 text-center ${w === thisWeek ? 'border-x-2 border-blue-200' : ''}`}>
                      <div
                        className={`rounded-md px-2 py-1.5 text-xs font-medium tabular-nums ${utilizationClass(pct)}`}
                        title={`${formatWeek(w)}: ${formatHours(series[w])} of ${formatHours(t.capacity[w])}`}
                      >
                        <div>{pct}%</div>
                        <div className="font-normal opacity-75">{formatHours(series[w])}</div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>
);

export default TeamConsumptionTable;
