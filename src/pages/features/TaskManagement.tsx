import { CheckSquare, ListTodo, Users, Calendar } from 'lucide-react';
import FeatureHeader from '../../components/FeatureHeader';
import FeatureFooter from '../../components/FeatureFooter';

const TaskManagement = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <FeatureHeader
        icon={CheckSquare}
        title="Task Management"
        description="Stay organized and boost team productivity"
      />

      {/* Feature Highlights */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <ListTodo className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Task Organization</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Create, organize, and prioritize tasks efficiently.
            </p>
            <img
              src="https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&q=80&w=2000"
              alt="Task Organization"
              className="rounded-lg shadow-lg w-full"
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Users className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Team Collaboration</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Collaborate with team members and track progress together.
            </p>
            <img
              src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=2000"
              alt="Team Collaboration"
              className="rounded-lg shadow-lg w-full"
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Calendar className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Task Scheduling</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Schedule tasks and set deadlines with calendar integration.
            </p>
            <img
              src="https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&q=80&w=2000"
              alt="Task Scheduling"
              className="rounded-lg shadow-lg w-full"
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <CheckSquare className="text-blue-400" size={24} />
              <h3 className="text-xl font-semibold text-white">Progress Tracking</h3>
            </div>
            <p className="text-gray-400 mb-6">
              Monitor task progress and team performance.
            </p>
            <img
              src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=2000"
              alt="Progress Tracking"
              className="rounded-lg shadow-lg w-full"
            />
          </div>
        </div>
      </div>

      <FeatureFooter />
    </div>
  );
};

export default TaskManagement;