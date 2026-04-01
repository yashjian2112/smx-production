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
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      {error && (
        <div
          className="p-3 rounded-lg text-red-400 text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-[11px] font-medium text-zinc-500 tracking-widest uppercase">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-field text-sm"
          placeholder="you@smx.com"
          autoComplete="email"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-[11px] font-medium text-zinc-500 tracking-widest uppercase">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field text-sm"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-3 text-sm font-semibold"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-smx-dark relative overflow-hidden">
      {/* Ambient radial glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(14,165,233,0.12) 0%, transparent 65%)',
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo mark */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
            style={{
              background: 'linear-gradient(135deg, rgba(14,165,233,0.15) 0%, rgba(14,165,233,0.04) 100%)',
              border: '1px solid rgba(14,165,233,0.2)',
            }}
          >
            <span className="text-sky-400 font-bold text-base tracking-tight">SMX</span>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">SMX Drives</h1>
          <p className="text-zinc-600 text-sm mt-1 font-light">Production Tracker</p>
          {process.env.NEXT_PUBLIC_APP_URL?.includes('testing') && (
            <div className="mt-3 inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
              Testing Environment
            </div>
          )}
        </div>

        <Suspense fallback={<div className="text-zinc-700 text-center text-sm">Loading…</div>}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-zinc-700 text-xs mt-5 font-light">
          admin · manager · emp @smx.com
        </p>
      </div>
    </div>
  );
}
