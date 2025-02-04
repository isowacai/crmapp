import type { LucideIcon } from 'lucide-react';

interface DashboardCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  color: string;
}

const DashboardCard = ({
  title,
  value,
  icon: Icon,
  color,
}: DashboardCardProps) => {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
        </div>
        <div className={`p-3 rounded-xl ${color} transform transition-transform hover:scale-110`}>
          <Icon size={24} className="text-white" />
        </div>
      </div>
    </div>
  );
};

export default DashboardCard;