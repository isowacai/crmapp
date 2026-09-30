import { useState } from 'react';
import { useChartTooltip } from './useChartTooltip';
import { TooltipRow } from './TooltipRow';
import { niceTicks } from './chartTheme';

export interface ColumnSeries {
  key: string;
  label: string;
  values: number[];
  color: string;
  colors?: string[]; // per-column colours, for a single series whose columns are ordered (e.g. priority)
}

// Vertical columns grouped by category. One shared baseline and axis; legend shown for 2+ series.
const ColumnChart = ({
  categories,
  series,
  height = 200,
  showValues = false,
  unit = ''
}: {
  categories: string[];
  series: ColumnSeries[];
  height?: number;
  showValues?: boolean; // value on each column cap; use only for a handful of columns
  unit?: string;
}) => {
  const { containerProps, show, tooltip } = useChartTooltip();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const max = Math.max(0, ...series.flatMap(s => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const barWidth = series.length > 1 ? 14 : 24;

  const tipFor = (i: number) => (
    <>
      <div className="font-medium text-gray-900 mb-1">{categories[i]}</div>
      {series.map(s => (
        <TooltipRow key={s.key} color={s.colors?.[i] ?? s.color} label={s.label} value={`${s.values[i]}${unit}`} />
      ))}
    </>
  );

  return (
    <div {...containerProps}>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-4 mb-3 text-xs text-gray-600">
          {series.map(s => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div className={`flex ${showValues ? 'mt-5' : ''}`}>
        {/* Y axis ticks */}
        <div className="relative w-8 shrink-0 text-[11px] text-gray-400 tabular-nums" style={{ height }}>
          {ticks.map(t => (
            <span key={t} className="absolute right-2" style={{ bottom: `${(t / top) * 100}%`, transform: 'translateY(50%)' }}>
              {t.toLocaleString()}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* Gridlines; the zero line is the baseline */}
          <div className="absolute inset-x-0 top-0" style={{ height }}>
            {ticks.map(t => (
              <div
                key={t}
                className={`absolute inset-x-0 ${t === 0 ? 'bg-[#c3c2b7]' : 'bg-[#eeede8]'}`}
                style={{ bottom: `${(t / top) * 100}%`, height: 1 }}
              />
            ))}
          </div>

          <div className="relative flex" style={{ height }}>
            {categories.map((cat, i) => (
              <div
                key={cat}
                className={`flex-1 flex items-end justify-center gap-0.5 rounded-t-md transition-colors ${activeIndex === i ? 'bg-gray-100/70' : ''}`}
                onMouseMove={e => { setActiveIndex(i); show(e, tipFor(i)); }}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {series.map(s => {
                  const v = s.values[i];
                  return (
                    <div key={s.key} className="relative h-full flex items-end" style={{ width: barWidth }}>
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${top ? (v / top) * 100 : 0}%`,
                          minHeight: v > 0 ? 2 : 0,
                          backgroundColor: s.colors?.[i] ?? s.color
                        }}
                      />
                      {showValues && (
                        // Value sits just above the column cap
                        <span
                          className="absolute left-1/2 -translate-x-1/2 text-[11px] font-medium text-gray-700 tabular-nums"
                          style={{ bottom: `calc(${top ? (v / top) * 100 : 0}% + 2px)` }}
                        >
                          {v}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* X labels */}
          <div className="flex mt-2">
            {categories.map(cat => (
              <div key={cat} className="flex-1 text-center text-[11px] text-gray-500 truncate px-0.5">{cat}</div>
            ))}
          </div>
        </div>
      </div>
      {tooltip}
    </div>
  );
};

export default ColumnChart;
