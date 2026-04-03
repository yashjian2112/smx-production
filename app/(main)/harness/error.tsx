'use client';

import { RefreshCw } from 'lucide-react';

export default function HarnessError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
      <p className="text-red-400 text-sm">Something went wrong loading harness production.</p>
      <p className="text-slate-500 text-xs">{error.message}</p>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-slate-200 text-sm hover:bg-slate-600"
      >
        <RefreshCw className="w-4 h-4" /> Try Again
      </button>
    </div>
  );
}
