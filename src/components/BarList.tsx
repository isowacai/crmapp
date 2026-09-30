interface BarItem {
  label: string;
  value: number;
  color?: string;
  suffix?: string; // shown after the value, e.g. "%" or "h"
}

// Horizontal bar chart; bars are scaled to `max` (defaults to the largest value)
const BarList = ({ items, max, emptyText = 'No data yet' }: { items: BarItem[]; max?: number; emptyText?: string }) => {
  const scale = max ?? Math.max(...items.map(i => i.value), 0);

  if (items.length === 0) {
    return <p className="text-sm text-gray-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.label}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-700 truncate pr-2">{item.label}</span>
            <span className="font-medium text-gray-900 tabular-nums">
              {Math.round(item.value * 10) / 10}
              {item.suffix}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${scale > 0 ? Math.min((item.value / scale) * 100, 100) : 0}%`,
                backgroundColor: item.color || '#2563eb'
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default BarList;
