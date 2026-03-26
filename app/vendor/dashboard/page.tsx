'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type RFQItem = { id: string; qtyRequired: number; material?: { name: string; unit: string } | null; itemDescription?: string | null; itemUnit?: string | null };
type MyQuote = { id: string; status: string; totalAmount: number; submittedAt: string } | null;
type RFQ = {
  id: string; rfqNumber: string; title: string; status: string;
  deadline?: string; paymentTerms?: string;
  items: RFQItem[];
  myQuote: MyQuote;
};

const STATUS_COLOR: Record<string, string> = {
  OPEN:   'bg-green-900/40 text-green-300 border border-green-700/50',
  CLOSED: 'bg-zinc-800 text-zinc-400',
  SUBMITTED: 'bg-blue-900/40 text-blue-300 border border-blue-700/50',
  SELECTED: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
  REJECTED: 'bg-red-900/40 text-red-300 border border-red-700/50',
};

export default function VendorDashboard() {
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorName, setVendorName] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch('/api/vendor-portal/rfq')
      .then(async r => {
        if (r.status === 401) { router.push('/vendor/login'); return; }
        setRfqs(await r.json());
        setLoading(false);
      })
      .catch(() => router.push('/vendor/login'));
  }, [router]);

  async function logout() {
    await fetch('/api/vendor-portal/auth', { method: 'DELETE' });
    router.push('/vendor/login');
  }

  const open   = rfqs.filter(r => r.status === 'OPEN' && !r.myQuote);
  const quoted = rfqs.filter(r => r.myQuote);
  const closed = rfqs.filter(r => r.status === 'CLOSED' && !r.myQuote);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm font-bold">S</div>
          <div>
            <div className="text-sm font-semibold text-white">SMX Drives</div>
            <div className="text-xs text-zinc-500">Vendor Portal</div>
          </div>
        </div>
        <button onClick={logout} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Logout</button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-white">{open.length}</div>
            <div className="text-xs text-zinc-500 mt-0.5">Open RFQs</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-blue-400">{quoted.length}</div>
            <div className="text-xs text-zinc-500 mt-0.5">Quotes Submitted</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-zinc-400">{closed.length}</div>
            <div className="text-xs text-zinc-500 mt-0.5">Closed</div>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-zinc-500 py-12">Loading...</div>
        ) : rfqs.length === 0 ? (
          <div className="text-center text-zinc-500 py-16">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-sm">No RFQs yet.</p>
            <p className="text-xs text-zinc-600 mt-1">You will be notified when SMX invites you to quote.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rfqs.map(rfq => (
              <div key={rfq.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-white text-sm font-semibold">{rfq.rfqNumber}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[rfq.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                        {rfq.status}
                      </span>
                      {rfq.myQuote && (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[rfq.myQuote.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                          Quote: {rfq.myQuote.status}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-300 text-sm mt-1">{rfq.title}</p>
                    <div className="flex gap-3 mt-1 flex-wrap">
                      {rfq.deadline && (
                        <span className="text-xs text-zinc-500">
                          Deadline: {new Date(rfq.deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      {rfq.paymentTerms && <span className="text-xs text-zinc-500">Terms: {rfq.paymentTerms}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {rfq.items.slice(0, 3).map(item => (
                        <span key={item.id} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                          {item.material?.name ?? item.itemDescription} × {item.qtyRequired}
                        </span>
                      ))}
                      {rfq.items.length > 3 && (
                        <span className="text-xs text-zinc-600">+{rfq.items.length - 3} more</span>
                      )}
                    </div>
                    {rfq.myQuote && (
                      <p className="text-xs text-zinc-400 mt-1">
                        Your quote: ₹{rfq.myQuote.totalAmount.toLocaleString('en-IN')} · {new Date(rfq.myQuote.submittedAt).toLocaleDateString('en-IN')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {rfq.status === 'OPEN' && !rfq.myQuote && (
                      <Link href={`/vendor/${rfq.id}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white whitespace-nowrap">
                        Submit Quote
                      </Link>
                    )}
                    {rfq.myQuote && (
                      <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-400 whitespace-nowrap">
                        Quoted ✓
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
