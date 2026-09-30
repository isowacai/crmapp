import React, { useState } from 'react';
import { useChartTooltip } from './useChartTooltip';
import { TooltipRow } from './TooltipRow';
import { INK } from './chartTheme';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  color: string;
  valueLabel?: string; // text at the bar tip; defaults to the value
  badge?: React.ReactNode; // e.g. a status icon shown after the value
  tooltip?: React.ReactNode; // extra tooltip rows
}

// Horizontal bars with the value at the tip and an optional reference line (e.g. 100% capacity)
const BarChart = ({
  data,
  max,
  reference,
  emptyText = 'No data yet'
}: {
  data: BarDatum[];
  max?: number;
  reference?: { value: number; label: string };
  emptyText?: string;
}) => {
  const { containerProps, show, tooltip } = useChartTooltip();
  const [active, setActive] = useState<string | null>(null);

  if (data.length === 0) {
    return <p className="text-sm text-gray-500 py-6">{emptyText}</p>;
  }

  const scale = Math.max(max ?? 0, reference?.value ?? 0, ...data.map(d => d.value), 1);
  const pos = (v: number) => `${(v / scale) * 100}%`;

  return (
    <div {...containerProps}>
      <div className="space-y-3">
        {data.map(d => (
          <div
            key={d.key}
            className={`grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 rounded-md px-1 py-0.5 transition-colors ${active === d.key ? 'bg-gray-100/70' : ''}`}
            onMouseMove={e => {
              setActive(d.key);
              show(e, (
                <>
                  <div className="font-medium text-gray-900 mb-1">{d.label}</div>
                  <TooltipRow color={d.color} label="Value" value={d.valueLabel ?? d.value} />
                  {d.tooltip}
                </>
              ));
            }}
            onMouseLeave={() => setActive(null)}
          >
            <span className="text-sm text-gray-700 truncate" title={d.label}>{d.label}</span>
            <div className="relative h-5 flex items-center">
              {reference && (
                <div
                  className="absolute inset-y-[-4px] w-px"
                  style={{ left: pos(reference.value), backgroundColor: INK.baseline }}
                />
              )}
              <div
                className="h-4 rounded-r"
                style={{ width: pos(d.value), minWidth: d.value > 0 ? 2 : 0, backgroundColor: d.color }}
              />
              <span className="ml-2 flex items-center gap-1 text-xs font-medium text-gray-800 tabular-nums whitespace-nowrap">
                {d.valueLabel ?? d.value}
                {d.badge}
              </span>
            </div>
          </div>
        ))}
      </div>
      {reference && (
        <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 px-1 mt-1">
          <span />
          <div className="relative h-4 text-[11px] text-gray-400">
            <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pos(reference.value) }}>{reference.label}</span>
          </div>
        </div>
      )}
      {tooltip}
    </div>
  );
};

export default BarChart;
