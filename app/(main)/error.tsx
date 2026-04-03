'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-5">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/10">
        <AlertTriangle className="w-7 h-7 text-amber-400" />
      </div>
      <div className="text-center space-y-1.5">
        <h2 className="text-base font-semibold text-slate-200">Page failed to load</h2>
        <p className="text-sm text-slate-400 max-w-xs">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
      </div>
      {error.digest && (
        <p className="text-xs text-slate-600 font-mono">ID: {error.digest}</p>
      )}
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-500 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
        <a
          href="/dashboard"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-slate-200 text-sm font-medium hover:bg-slate-600 transition-colors"
        >
          <Home className="w-4 h-4" /> Dashboard
        </a>
      </div>
    </div>
  );
}
