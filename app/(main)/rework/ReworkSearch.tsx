'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export function ReworkSearch({ currentQuery }: { currentQuery: string }) {
  const [value, setValue] = useState(currentQuery);
  const router = useRouter();

  // Debounce search — navigate with query param after 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = value.trim();
      if (trimmed !== currentQuery) {
        const params = new URLSearchParams({ tab: 'completed' });
        if (trimmed) params.set('q', trimmed);
        router.replace(`/rework?${params.toString()}`);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [value, currentQuery, router]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Search RTN, client, serial, issue..."
        className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm text-white bg-transparent outline-none placeholder-zinc-600"
        style={{ border: '1px solid rgba(255,255,255,0.1)' }}
      />
    </div>
  );
}
