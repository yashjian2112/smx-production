'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, Search, Package, X } from 'lucide-react';
import { StageWorkFlow } from '@/components/StageWorkFlow';
import { StageHistory } from '@/components/StageHistory';
import { QcChecklist } from './QcChecklist';

type ReworkRecord = {
  id: string;
  status: string;
  correctiveAction: string | null;
  rootCauseStage: string | null;
  rootCauseCategory: { name: string } | null;
  assignedUser: { name: string } | null;
  createdAt: string;
};

type Props = {
  unitId: string;
  unitSerial: string;
  stageBarcode: string | null;
  currentStage: string;
  currentStatus: string;
  isEmployee: boolean;
  role?: string;
  orderId: string | null;
  reworkRecords?: ReworkRecord[];
  productName?: string;
  orderNumber?: string;
  qcBarcode?: string | null;
  powerstageBarcode?: string | null;
  brainboardBarcode?: string | null;
};

type ReworkMat = {
  id: string;
  materialName: string;
  unit: string;
  qtyIssued: number;
  rawMaterial: { id: string; name: string; code: string; unit: string };
  createdAt: string;
};
type InvMaterial = { id: string; name: string; code: string; unit: string };

function ReworkMaterials({ reworkRecordId, isOpen }: { reworkRecordId: string; isOpen: boolean }) {
  const [materials, setMaterials] = useState<ReworkMat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [allMats, setAllMats] = useState<InvMaterial[]>([]);
  const [matSearch, setMatSearch] = useState('');
  const [selectedMat, setSelectedMat] = useState<InvMaterial | null>(null);
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const fetchMaterials = useCallback(async () => {
    try {
      const res = await fetch(`/api/rework/materials?reworkRecordId=${reworkRecordId}`);
      if (res.ok) setMaterials(await res.json());
    } finally { setLoading(false); }
  }, [reworkRecordId]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  useEffect(() => {
    if (!showAdd) return;
    fetch('/api/inventory/materials').then(r => r.json()).then(d =>
      setAllMats(Array.isArray(d) ? d : (Array.isArray(d.materials) ? d.materials : []))
    );
  }, [showAdd]);

  const filteredMats = allMats.filter(m =>
    m.name.toLowerCase().includes(matSearch.toLowerCase()) || m.code.toLowerCase().includes(matSearch.toLowerCase())
  ).slice(0, 20);

  async function addMaterial() {
    if (!selectedMat || !qty) { setErr('Select material and enter quantity'); return; }
    setSaving(true); setErr('');
    try {
      const res = await fetch('/api/rework/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reworkRecordId, rawMaterialId: selectedMat.id, quantity: parseFloat(qty), notes: notes.trim() || undefined }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      setShowAdd(false); setSelectedMat(null); setQty(''); setNotes(''); setMatSearch('');
      await fetchMaterials();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Materials Used</p>
        {isOpen && !showAdd && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-sky-400 hover:text-sky-300 transition-colors"
            style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)' }}>
            <Plus className="w-3 h-3" /> Add Material
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl p-3 space-y-2.5" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)' }}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input value={matSearch} onChange={e => { setMatSearch(e.target.value); setSelectedMat(null); }}
              placeholder="Search inventory material…"
              className="w-full pl-8 pr-3 py-2 rounded-lg text-xs text-white placeholder-zinc-600 bg-transparent outline-none"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
          {matSearch && !selectedMat && (
            <div className="rounded-lg overflow-hidden max-h-32 overflow-y-auto" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
              {filteredMats.map(m => (
                <button key={m.id} onClick={() => { setSelectedMat(m); setMatSearch(m.name); }}
                  className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-white/10 transition-colors text-zinc-300">
                  <span className="font-mono text-zinc-500 mr-2">{m.code}</span>{m.name}
                </button>
              ))}
              {filteredMats.length === 0 && <p className="px-3 py-2 text-zinc-600 text-[11px]">No materials found</p>}
            </div>
          )}
          {selectedMat && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px]"
              style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)' }}>
              <Package className="w-3 h-3 text-sky-400" />
              <span className="text-sky-300 font-medium">{selectedMat.name}</span>
              <span className="text-zinc-500 font-mono">{selectedMat.code}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 mb-0.5 block">Quantity</label>
              <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. 2"
                onWheel={e => e.currentTarget.blur()}
                className="w-full px-2.5 py-1.5 rounded-lg text-xs text-white bg-transparent outline-none"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 mb-0.5 block">Notes (optional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason…"
                className="w-full px-2.5 py-1.5 rounded-lg text-xs text-white bg-transparent outline-none"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
          </div>
          {err && <p className="text-red-400 text-[11px]">{err}</p>}
          <div className="flex gap-2">
            <button onClick={addMaterial} disabled={saving}
              className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 transition-colors">
              {saving ? 'Adding…' : 'Add & Deduct Stock'}
            </button>
            <button onClick={() => { setShowAdd(false); setErr(''); setMatSearch(''); setSelectedMat(null); }}
              className="px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Materials list */}
      {loading ? (
        <p className="text-zinc-600 text-[11px]">Loading…</p>
      ) : materials.length === 0 && !showAdd ? (
        <p className="text-zinc-600 text-[11px] py-2">No materials logged yet</p>
      ) : (
        <div className="space-y-1">
          {materials.map(m => (
            <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px]"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-2">
                <span className="text-zinc-300 font-medium">{m.rawMaterial.name}</span>
                <span className="font-mono text-zinc-600">{m.rawMaterial.code}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold">{m.qtyIssued}</span>
                <span className="text-zinc-500">{m.rawMaterial.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReworkTab({ unitId, reworkRecords }: { unitId: string; reworkRecords: ReworkRecord[] }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const latest = reworkRecords[0] ?? null;
  const isOpen = latest && (latest.status === 'OPEN' || latest.status === 'IN_PROGRESS');

  async function doAction(status: 'SENT_TO_QC' | 'COMPLETED') {
    setLoading(status);
    setError('');
    try {
      const res = await fetch(`/api/units/${unitId}/rework`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reworkId: latest?.id, status, correctiveAction: note || undefined }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed');
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading('');
    }
  }

  if (!latest) {
    return <p className="text-zinc-500 text-sm">No rework record found.</p>;
  }

  const stageLabel: Record<string, string> = {
    POWERSTAGE_MANUFACTURING: 'Powerstage', BRAINBOARD_MANUFACTURING: 'Brainboard',
    CONTROLLER_ASSEMBLY: 'Assembly', QC_AND_SOFTWARE: 'QC & Software',
    FINAL_ASSEMBLY: 'Final Assembly',
  };

  return (
    <div className="space-y-4">
      {/* Rework info */}
      <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.2)' }}>
        {latest.rootCauseStage && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide w-24 shrink-0">Root Cause Stage</span>
            <span className="text-sm text-orange-300">{stageLabel[latest.rootCauseStage] ?? latest.rootCauseStage}</span>
          </div>
        )}
        {latest.rootCauseCategory && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide w-24 shrink-0">Issue</span>
            <span className="text-sm text-zinc-200">{latest.rootCauseCategory.name}</span>
          </div>
        )}
        {latest.correctiveAction && (
          <div className="flex items-start gap-2">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide w-24 shrink-0 mt-0.5">Action Taken</span>
            <span className="text-sm text-zinc-300">{latest.correctiveAction}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide w-24 shrink-0">Status</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${latest.status === 'OPEN' ? 'text-orange-400 bg-orange-400/10' : latest.status === 'SENT_TO_QC' ? 'text-sky-400 bg-sky-400/10' : 'text-green-400 bg-green-400/10'}`}>
            {latest.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Materials consumed during rework */}
      <ReworkMaterials reworkRecordId={latest.id} isOpen={!!isOpen} />

      {/* Actions — only for open reworks */}
      {isOpen && (
        <div className="space-y-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe corrective action taken…"
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => doAction('SENT_TO_QC')}
              disabled={!!loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.3)' }}
            >
              {loading === 'SENT_TO_QC' ? 'Sending…' : 'Send to QC ↗'}
            </button>
            <button
              type="button"
              onClick={() => doAction('COMPLETED')}
              disabled={!!loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              {loading === 'COMPLETED' ? 'Saving…' : <>Mark Complete <Check className="w-4 h-4 ml-1 inline" /></>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkTabs({ unitId, unitSerial, stageBarcode, currentStage, currentStatus, isEmployee, role, orderId, reworkRecords = [], productName, orderNumber, qcBarcode, powerstageBarcode, brainboardBarcode }: Props) {
  const canDoQC = ['ADMIN', 'PRODUCTION_MANAGER', 'QC_USER'].includes(role ?? '');
  const isRework = currentStage === 'REWORK';
  const defaultTab = isRework ? 'rework' : isEmployee ? 'work' : 'history';
  const [tab, setTab] = useState<'work' | 'history' | 'rework'>(defaultTab);

  return (
    <div className="card overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {isEmployee && !isRework && (
          <button
            type="button"
            onClick={() => setTab('work')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'work' ? 'text-sky-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === 'work' ? { borderBottom: '2px solid #38bdf8', marginBottom: -1 } : {}}
          >
            Open Work
          </button>
        )}
        {isRework && (
          <button
            type="button"
            onClick={() => setTab('rework')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'rework' ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === 'rework' ? { borderBottom: '2px solid #fb923c', marginBottom: -1 } : {}}
          >
            Rework
          </button>
        )}
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'history' ? 'text-sky-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          style={tab === 'history' ? { borderBottom: '2px solid #38bdf8', marginBottom: -1 } : {}}
        >
          History
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {tab === 'rework' && (
          <ReworkTab unitId={unitId} reworkRecords={reworkRecords} />
        )}
        {tab === 'work' && currentStage === 'QC_AND_SOFTWARE' && canDoQC && (
          <QcChecklist
            unitId={unitId}
            currentStatus={currentStatus}
            serialNumber={unitSerial}
            productName={productName ?? ''}
            orderNumber={orderNumber ?? ''}
            qcBarcode={qcBarcode ?? null}
          />
        )}
        {tab === 'work' && isEmployee && currentStage !== 'QC_AND_SOFTWARE' && (
          <StageWorkFlow
            unitId={unitId}
            unitSerial={unitSerial}
            stageBarcode={stageBarcode}
            currentStage={currentStage}
            currentStatus={currentStatus}
            orderId={orderId}
            powerstageBarcode={powerstageBarcode}
            brainboardBarcode={brainboardBarcode}
          />
        )}
        {tab === 'history' && (
          <StageHistory unitId={unitId} />
        )}
      </div>
    </div>
  );
}
