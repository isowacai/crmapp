import { Layers } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '../lib/brand';

// The product logo and name, used in the sidebar and on public pages
const BrandMark = ({ size = 'md', tagline = true, tone = 'dark' }: { size?: 'sm' | 'md'; tagline?: boolean; tone?: 'dark' | 'light' }) => (
  <div className="flex items-center gap-3 min-w-0">
    <div className={`rounded-xl shrink-0 ${tone === 'dark' ? 'bg-blue-500/10 p-2' : 'bg-blue-600 p-2'}`}>
      <Layers className={tone === 'dark' ? 'text-blue-400' : 'text-white'} size={size === 'sm' ? 20 : 28} />
    </div>
    <div className="min-w-0">
      <p className={`font-bold leading-tight ${size === 'sm' ? 'text-lg' : 'text-2xl'} ${tone === 'dark' ? 'text-white' : 'text-gray-900'}`}>{APP_NAME}</p>
      {tagline && <p className={`text-xs ${tone === 'dark' ? 'text-blue-300' : 'text-gray-500'} truncate`}>{APP_TAGLINE}</p>}
    </div>
  </div>
);

export default BrandMark;
