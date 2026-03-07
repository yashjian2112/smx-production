'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/dashboard';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      router.push(from);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-smx-surface border border-slate-600 rounded-xl p-6 shadow-xl"
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
      <label className="block text-sm font-medium text-slate-400 mb-1">Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
        placeholder="you@smx.com"
        autoComplete="email"
        required
      />
      <label className="block text-sm font-medium text-slate-400 mt-4 mb-1">Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
        placeholder="••••••••"
        autoComplete="current-password"
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full mt-6 py-3 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold disabled:opacity-50"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-smx-dark">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">SMX Drives</h1>
          <p className="text-slate-400 text-sm mt-1">Production Tracker</p>
        </div>
        <Suspense fallback={<div className="text-slate-400 text-center">Loading…</div>}>
          <LoginForm />
        </Suspense>
        <p className="text-center text-slate-500 text-xs mt-4">
          Demo: admin@smx.com / admin123 · manager@smx.com / manager123 · emp@smx.com / emp123
        </p>
      </div>
    </div>
  );
}
