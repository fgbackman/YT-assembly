import {Component, StrictMode, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Last-resort guard: a render crash would otherwise leave a blank page on every reload.
class ErrorBoundary extends Component<{children: ReactNode}, {error: Error | null}> {
  state = {error: null as Error | null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  componentDidCatch(error: Error) {
    console.error('Assembly Player crashed:', error);
  }

  resetAndReload = () => {
    try {
      Object.keys(localStorage)
        .filter(key => key.startsWith('assembly_'))
        .forEach(key => localStorage.removeItem(key));
    } catch {}
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-neutral-400">
            The player hit an unexpected error. Resetting clears saved app data on this device and reloads.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-neutral-800 hover:bg-neutral-700 text-sm"
            >
              Reload
            </button>
            <button
              onClick={this.resetAndReload}
              className="px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-500 text-sm font-medium"
            >
              Reset &amp; reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
