import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

// Shows a message instead of a blank page when a page fails to render
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page failed to render:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-8">
        <div className="max-w-xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={20} /> This page couldn't be displayed
          </div>
          <p className="mt-2 text-sm">
            Something in the data or the page went wrong. Try reloading; if it keeps happening, share this message with
            your administrator.
          </p>
          <pre className="mt-3 whitespace-pre-wrap rounded bg-white/70 p-3 text-xs text-red-900">{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()} className="mt-4 btn-primary">
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
