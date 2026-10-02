import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import PublicLayout from '../../components/PublicLayout';
import { FEATURES, LEGACY_FEATURE_PATHS } from './featureContent';

// One public product page per lifecycle area, driven by featureContent
const FeaturePage = () => {
  const { slug = '' } = useParams();
  if (LEGACY_FEATURE_PATHS[slug]) return <Navigate to={`/features/${LEGACY_FEATURE_PATHS[slug]}`} replace />;

  const index = FEATURES.findIndex(f => f.slug === slug);
  if (index < 0) return <Navigate to="/" replace />;
  const feature = FEATURES[index];
  const next = FEATURES[(index + 1) % FEATURES.length];
  const Icon = feature.icon;

  return (
    <PublicLayout>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
          <ArrowLeft size={16} /> Home
        </Link>
        <div className="mt-6 flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <Icon className="text-blue-400" size={32} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white">{feature.title}</h1>
        </div>
        <p className="mt-4 text-lg text-gray-400 max-w-3xl">{feature.description}</p>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {feature.points.map(p => {
            const PointIcon = p.icon;
            return (
              <div key={p.title} className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex items-center gap-3 mb-3">
                  <PointIcon className="text-blue-400" size={22} />
                  <h2 className="text-lg font-semibold text-white">{p.title}</h2>
                </div>
                <p className="text-gray-400">{p.text}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-gray-800 pt-8">
          <Link to="/login" className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium">
            Sign in to get started
          </Link>
          <Link to={`/features/${next.slug}`} className="flex items-center gap-2 text-gray-300 hover:text-white">
            Next: {next.title} <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
};

export default FeaturePage;
