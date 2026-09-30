import { Package } from 'lucide-react';

const FeatureFooter = () => {

  const environment = window.APP_CONFIG?.environment ?? 'UNKNOWN';
  const buildVersion = window.APP_CONFIG?.buildVersion ?? 'UNKNOWN';

  return (
    <footer className="bg-gray-900 border-t border-gray-800 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 bg-opacity-10 rounded-xl">
              <Package className="text-blue-400" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Dukaan</h2>
              <p className="text-blue-400 text-sm">© 2025 All rights reserved</p>
              <p className="text-gray-400 text-xs mt-1">
                Environment: {environment} | Build: {buildVersion}
              </p>
            </div>
          </div>
          <div className="flex gap-8 text-gray-400">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default FeatureFooter;
