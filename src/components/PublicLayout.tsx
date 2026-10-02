import React from 'react';
import { Link } from 'react-router-dom';
import BrandMark from './BrandMark';
import { APP_NAME } from '../lib/brand';

// Header and footer for the public (signed-out) pages
const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  const environment = window.APP_CONFIG?.environment ?? 'UNKNOWN';
  const buildVersion = window.APP_CONFIG?.buildVersion ?? 'UNKNOWN';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col">
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap items-center justify-between gap-4">
          <Link to="/" aria-label={`${APP_NAME} home`}>
            <BrandMark />
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/login" className="px-4 py-2 text-gray-300 hover:text-white transition-colors">Sign in</Link>
            <Link to="/login?signup=true" className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">Create account</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-gray-800 bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <BrandMark size="sm" tagline={false} />
            <p className="text-gray-500 text-xs mt-2">© {new Date().getFullYear()} {APP_NAME} · Environment: {environment} | Build: {buildVersion}</p>
          </div>
          <nav className="flex gap-6 text-sm text-gray-400">
            <Link to="/features/intake" className="hover:text-white">Intake</Link>
            <Link to="/features/prioritization" className="hover:text-white">Prioritization</Link>
            <Link to="/features/capacity" className="hover:text-white">Capacity</Link>
            <Link to="/features/value" className="hover:text-white">Delivery &amp; value</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
