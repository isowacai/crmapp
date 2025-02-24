import { useNavigate } from 'react-router-dom';
import { Package, ArrowLeft } from 'lucide-react';
import { DivideIcon as LucideIcon } from 'lucide-react';

interface FeatureHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FeatureHeader = ({ icon: Icon, title, description }: FeatureHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 bg-opacity-10 rounded-xl">
              <Package className="text-blue-400" size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Dukaan</h1>
              <p className="text-blue-400 text-sm">Business Management System</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Home
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 bg-blue-500 bg-opacity-10 rounded-xl">
            <Icon className="text-blue-400" size={32} />
          </div>
          <h1 className="text-4xl font-bold text-white">{title}</h1>
        </div>
        <p className="text-gray-400 text-xl">{description}</p>
      </div>
    </header>
  );
};

export default FeatureHeader;