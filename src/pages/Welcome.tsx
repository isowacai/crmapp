import { Link, Navigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PublicLayout from '../components/PublicLayout';
import { APP_NAME } from '../lib/brand';
import { FEATURES } from './features/featureContent';

const LIFECYCLE = ['Request', 'Assess', 'Prioritize', 'Commit', 'Deliver', 'Measure value'];

const Welcome = () => {
  const { user } = useAuth();

  // Signed-in users go straight to their dashboard
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <PublicLayout>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">
          Know what's being asked of your team, and what you can deliver
        </h1>
        <p className="mt-6 text-lg text-gray-400 max-w-3xl mx-auto">
          {APP_NAME} helps teams that provide services take in demand, decide what to work on, commit only to what
          their capacity allows, and show the value they deliver. It is not a ticketing system.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/login" className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium">
            Sign in
          </Link>
          <Link to="/features/intake" className="px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium">
            How it works
          </Link>
        </div>

        <ol className="mt-14 flex flex-wrap justify-center gap-2 text-sm">
          {LIFECYCLE.map((step, i) => (
            <li key={step} className="flex items-center gap-2 text-gray-300">
              <span className="px-3 py-1.5 rounded-full border border-gray-700 bg-gray-800">{step}</span>
              {i < LIFECYCLE.length - 1 && <ArrowRight size={14} className="text-gray-600" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <Link
                key={f.slug}
                to={`/features/${f.slug}`}
                className="group bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-blue-500 transition-colors"
              >
                <div className="p-3 bg-blue-500/10 rounded-xl w-fit mb-4">
                  <Icon className="text-blue-400" size={24} />
                </div>
                <h2 className="text-lg font-semibold text-white mb-2">{f.title}</h2>
                <p className="text-gray-400 text-sm">{f.summary}</p>
                <p className="mt-4 text-sm font-medium text-blue-400 group-hover:text-blue-300 flex items-center gap-1">
                  Learn more <ArrowRight size={14} />
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </PublicLayout>
  );
};

export default Welcome;
