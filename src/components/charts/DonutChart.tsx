import { useState } from 'react';
import { useChartTooltip } from './useChartTooltip';
import { TooltipRow } from './TooltipRow';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

const polar = (cx: number, cy: number, r: number, angle: number) => {
  const rad = ((angle - 90) * Math.PI) / 180; // 0° at 12 o'clock, clockwise
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
};

const arcPath = (cx: number, cy: number, outer: number, inner: number, start: number, end: number) => {
  const large = end - start > 180 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, outer, start);
  const [x1, y1] = polar(cx, cy, outer, end);
  const [x2, y2] = polar(cx, cy, inner, end);
  const [x3, y3] = polar(cx, cy, inner, start);
  return `M ${x0} ${y0} A ${outer} ${outer} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 ${large} 0 ${x3} ${y3} Z`;
};

// Donut with a total in the centre and a legend that carries every value (colour is never the only cue)
const DonutChart = ({
  data,
  centerLabel,
  size = 176,
  thickness = 26,
  emptyText = 'No data yet'
}: {
  data: DonutSlice[];
  centerLabel: string;
  size?: number;
  thickness?: number;
  emptyText?: string;
}) => {
  const { containerProps, show, tooltip } = useChartTooltip();
  const [active, setActive] = useState<string | null>(null);

  const slices = data.filter(d => d.value > 0);
  const total = slices.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return <p className="text-sm text-gray-500 py-10 text-center">{emptyText}</p>;
  }

  const c = size / 2;
  const outer = c - 4; // room for the hover grow
  const inner = outer - thickness;
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;

  let angle = 0;
  const arcs = slices.map(d => {
    const sweep = (d.value / total) * 360;
    const arc = { ...d, start: angle, end: angle + sweep };
    angle += sweep;
    return arc;
  });

  const activeSlice = slices.find(s => s.key === active);

  const tip = (d: DonutSlice) => (
    <>
      <div className="font-medium text-gray-900 mb-1">{d.label}</div>
      <TooltipRow color={d.color} label="Requests" value={d.value} />
      <TooltipRow label="Share" value={pct(d.value)} />
    </>
  );

  return (
    <div {...containerProps} className="relative flex flex-col sm:flex-row items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={`${centerLabel}: ${total}`}>
        {arcs.length === 1 ? (
          <circle
            cx={c} cy={c} r={outer - thickness / 2} fill="none" stroke={arcs[0].color} strokeWidth={thickness}
            onMouseMove={e => { setActive(arcs[0].key); show(e, tip(arcs[0])); }}
            onMouseLeave={() => setActive(null)}
          />
        ) : (
          arcs.map(a => {
            const grow = active === a.key ? 3 : 0;
            return (
              <path
                key={a.key}
                d={arcPath(c, c, outer + grow, inner, a.start, a.end)}
                fill={a.color}
                stroke="#ffffff"
                strokeWidth={2}
                strokeLinejoin="round"
                opacity={active && active !== a.key ? 0.45 : 1}
                className="transition-opacity cursor-pointer"
                onMouseMove={e => { setActive(a.key); show(e, tip(a)); }}
                onMouseLeave={() => setActive(null)}
              />
            );
          })
        )}
        <text x={c} y={c - 4} textAnchor="middle" className="fill-gray-900" style={{ fontSize: 28, fontWeight: 600 }}>
          {activeSlice ? activeSlice.value : total}
        </text>
        <text x={c} y={c + 16} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 11 }}>
          {activeSlice ? pct(activeSlice.value) : centerLabel}
        </text>
      </svg>

      <ul className="w-full space-y-1.5 text-sm">
        {slices.map(d => (
          <li
            key={d.key}
            className={`flex items-center gap-2 rounded-md px-2 py-1 cursor-default transition-colors ${active === d.key ? 'bg-gray-100' : ''}`}
            onMouseEnter={() => setActive(d.key)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-gray-700 truncate">{d.label}</span>
            <span className="ml-auto font-medium text-gray-900 tabular-nums">{d.value}</span>
            <span className="w-10 text-right text-gray-500 tabular-nums">{pct(d.value)}</span>
          </li>
        ))}
      </ul>
      {tooltip}
    </div>
  );
};

export default DonutChart;
