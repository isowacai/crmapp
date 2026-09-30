const Stat = ({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) => (
  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
    <p className="text-xs font-medium text-gray-500">{label}</p>
    <p className={`text-xl font-semibold mt-0.5 ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    {sub && <p className="text-xs text-gray-500">{sub}</p>}
  </div>
);

export default Stat;
