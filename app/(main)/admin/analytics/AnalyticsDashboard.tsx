'use client';
import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';

type Analytics = {
  summary: {
    totalPOs90Days: number; totalSpend90Days: number; totalSpend30Days: number;
    aiAssignedCount: number; unreadNotifications: number; activeVendors: number;
    roCount90Days: number; damageReports90Days: number;
  };
  topVendorsBySpend: { vendorId: string; name: string; spend: number; poCount: number }[];
  vendorRankings: { vendorId: string; name: string; avgQuality: number | null; onTimePct: number | null; avgPricingScore: number | null; totalPOs: number }[];
  topDamagedVendors: { name: string; totalDamaged: number; reports: number }[];
  roByTrigger: Record<string, number>;
  monthlySpend: Record<string, number>;
  topMaterials: { id: string; name: string; unit: string; lastPurchasePrice: number | null; lastPurchasedAt: string | null; lastPurchasedFrom: string | null; purchasePrice: number }[];
};

function fmt(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className={`bg-zinc-900 border ${color ?? 'border-zinc-800'} rounded-xl p-4`}>
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

function StarRating({ value }: { value: number | null }) {
  if (value === null) return <span className="text-zinc-600 text-xs">No data</span>;
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5 text-xs">
      {Array.from({ length: rounded }).map((_, i) => (
        <Star key={`f${i}`} className="w-4 h-4 fill-amber-400 text-amber-400 inline" />
      ))}
      {Array.from({ length: 5 - rounded }).map((_, i) => (
        <Star key={`e${i}`} className="w-4 h-4 text-gray-300 inline" />
      ))}
      <span className="ml-1 text-amber-400">{value.toFixed(1)}</span>
    </span>
  );
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<'overview' | 'vendors' | 'materials' | 'notifications'>('overview');
  const [notifications, setNotifications] = useState<{ id: string; type: string; title: string; body: string; read: boolean; createdAt: string }[]>([]);

  useEffect(() => {
    fetch('/api/admin/analytics').then(r => r.ok ? r.json() : null).then(d => { setData(d); setLoading(false); });
  }, []);

  useEffect(() => {
    if (section === 'notifications') {
      fetch('/api/procurement/admin-notifications').then(r => r.ok ? r.json() : []).then(setNotifications);
    }
  }, [section]);

  async function markAllRead() {
    await fetch('/api/procurement/admin-notifications', { method: 'PATCH' });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (data) setData({ ...data, summary: { ...data.summary, unreadNotifications: 0 } });
  }

  if (loading) return <div className="text-center text-zinc-500 py-20">Loading analytics...</div>;
  if (!data) return <div className="text-center text-zinc-500 py-20">Failed to load analytics.</div>;

  const { summary, topVendorsBySpend, vendorRankings, topDamagedVendors, roByTrigger, monthlySpend, topMaterials } = data;

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'vendors', label: 'Vendor Rankings' },
    { id: 'materials', label: 'Price History' },
    { id: 'notifications', label: `Notifications${summary.unreadNotifications > 0 ? ` (${summary.unreadNotifications})` : ''}` },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Procurement Analytics</h2>
        <span className="text-xs text-zinc-500">Last 90 days</span>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 overflow-x-auto">
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${section === s.id ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {section === 'overview' && (
        <div className="space-y-5">
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total Spend (90d)" value={fmt(summary.totalSpend90Days)} sub={`${summary.totalPOs90Days} POs`} />
            <StatCard label="Spend (30d)" value={fmt(summary.totalSpend30Days)} />
            <StatCard label="AI-Assigned POs" value={summary.aiAssignedCount} sub="of 90d total" />
            <StatCard label="Active Vendors" value={summary.activeVendors} />
            <StatCard label="Req. Orders (90d)" value={summary.roCount90Days} />
            <StatCard label="Damage Reports" value={summary.damageReports90Days} color={summary.damageReports90Days > 10 ? 'border-red-800/50' : 'border-zinc-800'} />
          </div>

          {/* Monthly spend */}
          {Object.keys(monthlySpend).length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Monthly Spend</p>
              <div className="space-y-2">
                {Object.entries(monthlySpend).sort().map(([month, spend]) => {
                  const maxSpend = Math.max(...Object.values(monthlySpend));
                  const pct = (spend / maxSpend) * 100;
                  return (
                    <div key={month} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-400 w-16 shrink-0">{month}</span>
                      <div className="flex-1 bg-zinc-800 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-zinc-400 w-20 text-right shrink-0">{fmt(spend)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* RO triggers */}
          {Object.keys(roByTrigger).length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">RO Triggers</p>
              <div className="flex gap-3 flex-wrap">
                {Object.entries(roByTrigger).map(([trigger, count]) => (
                  <div key={trigger} className="text-center">
                    <div className="text-2xl font-bold text-white">{count}</div>
                    <div className="text-xs text-zinc-500">{trigger.replace(/_/g, ' ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top damaged vendors */}
          {topDamagedVendors.length > 0 && (
            <div className="bg-zinc-900 border border-red-900/30 rounded-xl p-4">
              <p className="text-xs text-red-400 uppercase tracking-wide mb-3">Top Damage Sources (by vendor)</p>
              <div className="space-y-2">
                {topDamagedVendors.map(v => (
                  <div key={v.name} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300">{v.name}</span>
                    <span className="text-red-400 text-xs">{v.totalDamaged} units · {v.reports} reports</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top vendors by spend */}
          {topVendorsBySpend.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Top Vendors by Spend</p>
              <div className="space-y-2">
                {topVendorsBySpend.map((v, i) => (
                  <div key={v.vendorId} className="flex items-center gap-3">
                    <span className="text-zinc-600 text-xs w-5">{i + 1}.</span>
                    <span className="text-zinc-300 text-sm flex-1">{v.name}</span>
                    <span className="text-zinc-400 text-xs">{v.poCount} POs</span>
                    <span className="text-white text-sm font-medium">{fmt(v.spend)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {section === 'vendors' && (
        <div className="space-y-3">
          {vendorRankings.length === 0 ? (
            <div className="text-center text-zinc-500 py-12">No vendor performance data yet. Data is recorded after each GRN.</div>
          ) : vendorRankings.map((v, i) => (
            <div key={v.vendorId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-zinc-600 text-xs">#{i + 1}</span>
                <span className="font-medium text-white">{v.name}</span>
                <span className="text-xs text-zinc-500 ml-auto">{v.totalPOs} POs</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-zinc-500 mb-1">Quality</p>
                  <StarRating value={v.avgQuality} />
                </div>
                <div>
                  <p className="text-zinc-500 mb-1">On-Time</p>
                  <span className={v.onTimePct !== null ? (v.onTimePct >= 80 ? 'text-emerald-400' : v.onTimePct >= 60 ? 'text-amber-400' : 'text-red-400') : 'text-zinc-600'}>
                    {v.onTimePct !== null ? `${v.onTimePct}%` : 'No data'}
                  </span>
                </div>
                <div>
                  <p className="text-zinc-500 mb-1">Pricing</p>
                  <StarRating value={v.avgPricingScore} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {section === 'materials' && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">Last purchase price per material — updated automatically on every GRN.</p>
          {topMaterials.length === 0 ? (
            <div className="text-center text-zinc-500 py-12">No purchase history yet.</div>
          ) : topMaterials.map(m => (
            <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-white text-sm font-medium">{m.name}</p>
                {m.lastPurchasedFrom && <p className="text-zinc-500 text-xs mt-0.5">From: {m.lastPurchasedFrom}</p>}
              </div>
              <div className="text-right">
                <p className="text-white font-mono">₹{m.lastPurchasePrice?.toLocaleString('en-IN')} / {m.unit}</p>
                {m.lastPurchasedAt && <p className="text-zinc-500 text-xs">{new Date(m.lastPurchasedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {section === 'notifications' && (
        <div className="space-y-3">
          {notifications.length > 0 && summary.unreadNotifications > 0 && (
            <div className="flex justify-end">
              <button onClick={markAllRead} className="text-xs text-zinc-400 hover:text-white">Mark all as read</button>
            </div>
          )}
          {notifications.length === 0 ? (
            <div className="text-center text-zinc-500 py-12">No notifications.</div>
          ) : notifications.map(n => (
            <div key={n.id} className={`border rounded-xl px-4 py-3 ${!n.read ? 'bg-blue-950/20 border-blue-800/30' : 'bg-zinc-900 border-zinc-800'}`}>
              <div className="flex items-start gap-2">
                {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />}
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{n.title}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{n.body}</p>
                  <p className="text-xs text-zinc-600 mt-1">{new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded ${n.type === 'OVERRIDE_REQUEST' ? 'bg-red-900/40 text-red-300' : n.type === 'PRICE_DEVIATION' ? 'bg-amber-900/40 text-amber-300' : 'bg-zinc-800 text-zinc-400'}`}>
                  {n.type.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
