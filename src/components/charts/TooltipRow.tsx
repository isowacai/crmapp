import React from 'react';

export const TooltipRow = ({ color, label, value }: { color?: string; label: string; value: React.ReactNode }) => (
  <div className="flex items-center gap-2">
    {color && <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />}
    <span className="text-gray-600">{label}</span>
    <span className="ml-auto pl-3 font-semibold tabular-nums">{value}</span>
  </div>
);
