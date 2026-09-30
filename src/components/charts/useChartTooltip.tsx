import React, { useCallback, useRef, useState } from 'react';

interface TooltipState {
  x: number;
  y: number;
  content: React.ReactNode;
}

// Pointer-following tooltip. Wrap the chart in `containerProps` and call `show` from marks' mouse events.
export const useChartTooltip = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TooltipState | null>(null);

  const show = useCallback((e: React.MouseEvent, content: React.ReactNode) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, content });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  const tooltip = tip && (
    <div
      className="absolute z-10 pointer-events-none bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-xs text-gray-800 whitespace-nowrap"
      style={{
        left: tip.x,
        top: tip.y,
        // Flip to the left of the pointer on the right half so it stays inside the card
        transform: `translate(${tip.x > (ref.current?.clientWidth ?? 0) / 2 ? 'calc(-100% - 12px)' : '12px'}, 12px)`
      }}
      role="tooltip"
    >
      {tip.content}
    </div>
  );

  return { containerProps: { ref, className: 'relative', onMouseLeave: hide }, show, hide, tooltip, activeTip: tip };
};
