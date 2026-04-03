'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled error:', error);
  }, [error]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-zinc-950 p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <AlertTriangle className="w-12 h-12 text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-200">Something went wrong</h2>
        <p className="text-sm text-slate-400">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="text-xs text-slate-600 font-mono">Error ID: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-500 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    </div>
  );
}
