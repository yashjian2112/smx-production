'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { BarcodeScanner } from './BarcodeScanner';
import { useRouter } from 'next/navigation';

type Submission = {
  id: string;
  startedAt: string;
  analysisStatus: string;
  analysisResult?: string | null;
  analysisIssues?: string | null;
  analysisSummary?: string | null;
  imageUrl?: string | null;
  buildTimeSec?: number | null;
};

type Issue = { name: string; status: string; note: string };

type Props = {
  unitId: string;
  unitSerial: string;
  currentStage: string;
  currentStatus: string;
};

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return <span className="font-mono text-amber-400 font-bold">{fmtDuration(elapsed)}</span>;
}

export function StageWorkFlow({ unitId, unitSerial, currentStage, currentStatus }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<'idle' | 'scanning' | 'working' | 'uploading' | 'analyzing' | 'result'>('idle');
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [capturedImage, setCapturedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [result, setResult] = useState<{ result: string; issues: Issue[]; summary: string } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraMode, setCameraMode] = useState(false);

  // Check for existing active submission on mount
  useEffect(() => {
    if (currentStatus === 'IN_PROGRESS') {
      fetch(`/api/units/${unitId}/work`)
        .then(r => r.json())
        .then(data => {
          if (data.active) {
            setSubmission(data.active);
            setStep('working');
          }
        })
        .catch(() => {});
    }
  }, [unitId, currentStatus]);

  // Start work after scanning unit
  const handleScan = useCallback(async (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized.includes(unitSerial.toUpperCase()) && !unitSerial.toUpperCase().includes(normalized)) {
      setError(`Wrong unit! Scanned: ${normalized}. Expected unit: ${unitSerial}`);
      setStep('idle');
      return;
    }
    setError('');
    try {
      const res = await fetch(`/api/units/${unitId}/work`, { method: 'POST' });
      const data = await res.json();
      setSubmission(data);
      setStep('working');
    } catch {
      setError('Failed to start work. Please try again.');
      setStep('idle');
    }
  }, [unitId, unitSerial]);

  // Camera for photo capture
  async function openCamera() {
    setCameraMode(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (cameraRef.current) { cameraRef.current.srcObject = stream; }
    } catch {
      setCameraMode(false);
      fileInputRef.current?.click();
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraMode(false);
  }

  function capturePhoto() {
    if (!cameraRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = cameraRef.current.videoWidth;
    canvas.height = cameraRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(cameraRef.current, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
      setCapturedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      stopCamera();
    }, 'image/jpeg', 0.92);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCapturedImage(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function submitImage() {
    if (!capturedImage || !submission) return;
    setStep('analyzing');
    setError('');

    const fd = new FormData();
    fd.append('image', capturedImage);
    fd.append('submissionId', submission.id);

    try {
      const res = await fetch(`/api/units/${unitId}/work`, { method: 'PUT', body: fd });
      const data = await res.json();
      setResult({ result: data.result, issues: data.issues ?? [], summary: data.summary });
      setStep('result');
      if (data.result === 'PASS') {
        setTimeout(() => router.refresh(), 2000);
      }
    } catch {
      setError('Submission failed. Please try again.');
      setStep('working');
    }
  }

  const stageLabel = currentStage.replace(/_/g, ' ');

  // ── IDLE: waiting to start ──────────────────────────────────────────────────
  if (step === 'idle') {
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl p-3 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}
        {currentStatus === 'COMPLETED' ? (
          <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <p className="text-green-400 font-semibold">Stage completed ✓</p>
            <p className="text-zinc-500 text-xs mt-1">This unit has moved to the next stage.</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setStep('scanning')}
            className="w-full py-4 rounded-2xl font-bold text-sm flex flex-col items-center gap-2"
            style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="7" y1="9" x2="7" y2="15" /><line x1="10" y1="9" x2="10" y2="15" />
              <line x1="13" y1="9" x2="13" y2="15" /><line x1="16" y1="9" x2="16" y2="15" />
            </svg>
            Scan unit barcode to start {stageLabel}
          </button>
        )}
      </div>
    );
  }

  // ── SCANNING ────────────────────────────────────────────────────────────────
  if (step === 'scanning') {
    return (
      <BarcodeScanner
        title={`Scan to start — ${stageLabel}`}
        hint={`Scan barcode for unit ${unitSerial}`}
        onScan={handleScan}
        onClose={() => setStep('idle')}
      />
    );
  }

  // ── WORKING: timer + photo capture ─────────────────────────────────────────
  if (step === 'working') {
    return (
      <div className="space-y-4">
        {/* Timer */}
        {submission && (
          <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
            <p className="text-zinc-500 text-xs mb-1">Time working</p>
            <LiveTimer startedAt={submission.startedAt} />
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Photo capture area */}
        <div>
          <p className="text-sm text-zinc-400 mb-2 font-medium">When done, take a photo of the completed work:</p>
          {previewUrl ? (
            <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid rgba(14,165,233,0.3)' }}>
              <Image src={previewUrl} alt="Captured" width={400} height={300} className="w-full object-cover max-h-56" />
              <button
                type="button"
                onClick={() => { setCapturedImage(null); setPreviewUrl(''); }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white text-xs"
              >✕</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={openCamera}
                className="py-4 rounded-xl flex flex-col items-center gap-2 text-sm text-sky-400"
                style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Take Photo
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-4 rounded-xl flex flex-col items-center gap-2 text-sm text-zinc-400"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload Photo
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
            </div>
          )}
        </div>

        {/* Live camera */}
        {cameraMode && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col">
            <div className="flex justify-between items-center p-4">
              <p className="text-white font-semibold">Take photo</p>
              <button type="button" onClick={stopCamera} className="text-zinc-400 hover:text-white">✕</button>
            </div>
            <div className="flex-1 relative">
              <video ref={cameraRef} className="w-full h-full object-cover" muted playsInline autoPlay />
            </div>
            <div className="p-6">
              <button
                type="button"
                onClick={capturePhoto}
                className="w-full py-4 rounded-2xl text-lg font-bold"
                style={{ background: 'white', color: 'black' }}
              >
                📸 Capture
              </button>
            </div>
          </div>
        )}

        {capturedImage && (
          <button
            type="button"
            onClick={submitImage}
            className="w-full py-4 rounded-2xl font-bold text-sm"
            style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: 'white' }}
          >
            Submit for AI Verification →
          </button>
        )}
      </div>
    );
  }

  // ── ANALYZING ───────────────────────────────────────────────────────────────
  if (step === 'analyzing') {
    return (
      <div className="py-10 text-center space-y-4">
        <div className="w-16 h-16 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-zinc-400 font-medium">AI is analyzing the image…</p>
        <p className="text-zinc-600 text-sm">Checking all components against the checklist</p>
      </div>
    );
  }

  // ── RESULT ──────────────────────────────────────────────────────────────────
  if (step === 'result' && result) {
    const pass = result.result === 'PASS';
    const issues = result.issues as Issue[];

    return (
      <div className="space-y-4">
        {/* Result banner */}
        <div
          className="rounded-2xl p-5 text-center"
          style={{
            background: pass ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${pass ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}
        >
          <div className="text-4xl mb-2">{pass ? '✅' : '❌'}</div>
          <p className={`text-lg font-bold ${pass ? 'text-green-400' : 'text-red-400'}`}>
            {pass ? 'Quality Check PASSED' : 'Quality Check FAILED'}
          </p>
          <p className="text-zinc-400 text-sm mt-2">{result.summary}</p>
          {pass && submission?.buildTimeSec && (
            <p className="text-zinc-500 text-xs mt-2">Build time: {fmtDuration(submission.buildTimeSec)}</p>
          )}
        </div>

        {/* Per-component results */}
        {issues.length > 0 && (
          <div className="card p-4 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Component Check</h4>
            {issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-3 py-1.5 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <span className="shrink-0 mt-0.5">
                  {issue.status === 'PRESENT' ? '✅' : issue.status === 'DEFECTIVE' ? '⚠️' : '❌'}
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{issue.name}</p>
                  {issue.note && <p className="text-xs text-zinc-500">{issue.note}</p>}
                </div>
                <span className={`ml-auto text-[10px] font-bold shrink-0 ${
                  issue.status === 'PRESENT' ? 'text-green-400' : issue.status === 'DEFECTIVE' ? 'text-amber-400' : 'text-red-400'
                }`}>{issue.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {!pass && (
          <button
            type="button"
            onClick={() => { setCapturedImage(null); setPreviewUrl(''); setResult(null); setStep('working'); }}
            className="w-full py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
          >
            Fix issues and retry →
          </button>
        )}
        {pass && (
          <div className="text-center text-zinc-500 text-sm">
            Stage completed! Moving to next stage…
          </div>
        )}
      </div>
    );
  }

  return null;
}
