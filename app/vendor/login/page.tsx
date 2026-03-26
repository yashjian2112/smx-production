'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VendorLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const r = await fetch('/api/vendor-portal/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (r.ok) {
      router.push('/vendor/dashboard');
    } else {
      const d = await r.json();
      setError(d.error ?? 'Login failed');
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white text-3xl font-bold mb-4">S</div>
          <h1 className="text-white text-2xl font-bold">SMX Drives</h1>
          <p className="text-zinc-400 text-base mt-1">Vendor Portal</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-white font-bold text-2xl mb-5">Sign in</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-zinc-400 text-sm font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@vendor.com"
                required
                className="w-full mt-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-base focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-zinc-400 text-sm font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full mt-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-base focus:outline-none focus:border-blue-500"
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-base transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          Access issues? Contact your SMX purchase manager.
        </p>
      </div>
    </div>
  );
}
