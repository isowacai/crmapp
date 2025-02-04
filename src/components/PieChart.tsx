import React from 'react';

interface DataItem {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  data: DataItem[];
  size: number;
  title: string;
}

const PieChart: React.FC<PieChartProps> = ({ data, size, title }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = 0;

  const paths = data.map((item, index) => {
    const angle = (item.value / total) * 360;
    const x1 = Math.cos((currentAngle * Math.PI) / 180) * size/2;
    const y1 = Math.sin((currentAngle * Math.PI) / 180) * size/2;
    const x2 = Math.cos(((currentAngle + angle) * Math.PI) / 180) * size/2;
    const y2 = Math.sin(((currentAngle + angle) * Math.PI) / 180) * size/2;
    
    const largeArcFlag = angle > 180 ? 1 : 0;
    const pathData = [
      `M ${size/2} ${size/2}`,
      `L ${size/2 + x1} ${size/2 + y1}`,
      `A ${size/2} ${size/2} 0 ${largeArcFlag} 1 ${size/2 + x2} ${size/2 + y2}`,
      'Z'
    ].join(' ');

    currentAngle += angle;
    return (
      <path
        key={index}
        d={pathData}
        fill={item.color}
        className="transition-opacity duration-200 hover:opacity-80"
      />
    );
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {paths}
        </svg>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-sm text-gray-600 whitespace-nowrap">
              {item.label} ({item.value})
            </span>
          </div>
        ))}
      </div>
      <span className="text-sm font-medium text-gray-700">{title}</span>
    </div>
  );
};

export default PieChart;