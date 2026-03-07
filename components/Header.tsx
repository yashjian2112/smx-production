'use client';

import { useRouter } from 'next/navigation';

export function Header({ title, user }: { title: string; user: { name: string; role: string } }) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 bg-smx-dark/95 backdrop-blur border-b border-slate-700 px-4 py-3 flex items-center justify-between">
      <h1 className="text-lg font-semibold truncate">{title}</h1>
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-sm hidden sm:inline">{user.name}</span>
        <span className="text-slate-500 text-xs px-2 py-0.5 rounded bg-slate-700">{user.role.replace('_', ' ')}</span>
        <button type="button" onClick={logout} className="text-slate-400 hover:text-white text-sm tap-target px-2">
          Logout
        </button>
      </div>
    </header>
  );
}
