'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
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

type Issue = { name: string; status: string; note: string; location?: string };

type Props = {
  unitId: string;
  unitSerial: string;
  stageBarcode: string | null;
  currentStage: string;
  currentStatus: string;
};

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return <span className="font-mono text-amber-400 font-bold">{fmtDuration(elapsed)}</span>;
}

export function StageWorkFlow({ unitId, currentStage, currentStatus }: Props) {
  const router = useRouter();

  // ── state machine ──────────────────────────────────────────────────────────
  // loading → auto-starting work
  // idle    → work couldn't auto-start, show manual "Start Work" button
  // working → work started, show "Open Work" button
  // open    → full-screen work panel (photo capture)
  // analyzing → AI running
  // result  → PASS / FAIL shown
  // completed → stage already done
  const [step, setStep] = useState<'loading' | 'idle' | 'working' | 'open' | 'analyzing' | 'result' | 'completed'>('loading');
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [capturedImage, setCapturedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [result, setResult] = useState<{ result: string; issues: Issue[]; summary: string } | null>(null);
  const [error, setError] = useState('');
  const [startingWork, setStartingWork] = useState(false);

  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen]   = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  // ── auto-capture state ────────────────────────────────────────────────────
  const [autoCapture, setAutoCapture]     = useState(true);
  const [stableMs, setStableMs]           = useState(0);          // 0–1500
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null); // 3,2,1
  const prevFrameRef    = useRef<ImageData | null>(null);
  const frameTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const stableMsRef     = useRef(0);
  const autoCapturedRef = useRef(false);

  const stageLabel = currentStage.replace(/_/g, ' ');

  // ── auto-start work on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (currentStatus === 'COMPLETED') {
      setStep('completed');
      return;
    }

    if (currentStatus === 'IN_PROGRESS') {
      // Try to resume existing submission
      fetch(`/api/units/${unitId}/work`)
        .then(r => r.json())
        .then(data => {
          if (data.active) {
            setSubmission(data.active);
            setStep('working');
          } else {
            // No active submission — create one
            return fetch(`/api/units/${unitId}/work`, { method: 'POST' })
              .then(r => r.json())
              .then(d => { setSubmission(d); setStep('working'); });
          }
        })
        .catch(() => setStep('idle'));
      return;
    }

    // PENDING — auto-start work
    fetch(`/api/units/${unitId}/work`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data?.id) {
          setSubmission(data);
          setStep('working');
        } else {
          setStep('idle');
        }
      })
      .catch(() => setStep('idle'));
  }, [unitId, currentStatus]);

  // ── manual start (fallback) ────────────────────────────────────────────────
  async function startWork() {
    setStartingWork(true);
    setError('');
    try {
      const res = await fetch(`/api/units/${unitId}/work`, { method: 'POST' });
      const data = await res.json();
      if (data?.id) {
        setSubmission(data);
        setStep('working');
      } else {
        setError(data?.error ?? 'Failed to start work. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setStartingWork(false);
    }
  }

  // ── camera helpers ─────────────────────────────────────────────────────────

  // Measures average pixel difference between two same-size ImageData frames.
  // Samples every 4th pixel for speed. Returns 0–255 (0 = identical).
  function getFrameDiff(a: ImageData, b: ImageData): number {
    let total = 0, count = 0;
    for (let i = 0; i < a.data.length; i += 16) {
      total +=
        (Math.abs(a.data[i]   - b.data[i])   +
         Math.abs(a.data[i+1] - b.data[i+1]) +
         Math.abs(a.data[i+2] - b.data[i+2])) / 3;
      count++;
    }
    return count > 0 ? total / count : 255;
  }

  const stopCamera = useCallback(() => {
    // Stop auto-capture timers
    if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null; }
    if (cdTimerRef.current)    { clearInterval(cdTimerRef.current);    cdTimerRef.current    = null; }
    stableMsRef.current = 0;
    autoCapturedRef.current = false;
    prevFrameRef.current = null;
    setStableMs(0);
    setAutoCountdown(null);
    // Stop stream
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCameraReady(false);
  }, []);

  // ── auto-capture: frame stability analysis ────────────────────────────────
  // Runs at 200 ms intervals once camera is live. Compares consecutive 160×120
  // frames. When the average pixel diff stays < 10 for 1.5 s the board is
  // considered stable → triggers a 3-count countdown → auto-captures.
  useEffect(() => {
    if (!cameraReady || !autoCapture) return;

    // Reset stability state each time camera opens / auto mode toggled on
    stableMsRef.current = 0;
    autoCapturedRef.current = false;
    prevFrameRef.current = null;
    setStableMs(0);
    setAutoCountdown(null);

    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 120;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    frameTimerRef.current = setInterval(() => {
      const video = cameraRef.current;
      if (!video || video.videoWidth === 0 || video.readyState < 2) return;
      if (autoCapturedRef.current) return;

      ctx.drawImage(video, 0, 0, 160, 120);
      const curr = ctx.getImageData(0, 0, 160, 120);

      if (prevFrameRef.current) {
        const diff = getFrameDiff(prevFrameRef.current, curr);

        if (diff < 10) {
          // Frame is stable — build up stability meter
          stableMsRef.current = Math.min(stableMsRef.current + 200, 1500);
        } else {
          // Camera is moving — decay faster than build
          stableMsRef.current = Math.max(0, stableMsRef.current - 350);
        }
        setStableMs(stableMsRef.current);

        // Reached full stability → start countdown
        if (stableMsRef.current >= 1500 && !autoCapturedRef.current) {
          autoCapturedRef.current = true;
          clearInterval(frameTimerRef.current!);
          frameTimerRef.current = null;

          let count = 3;
          setAutoCountdown(count);
          cdTimerRef.current = setInterval(() => {
            count--;
            if (count <= 0) {
              clearInterval(cdTimerRef.current!);
              cdTimerRef.current = null;
              setAutoCountdown(null);
              // capturePhoto only uses refs + stable setters — safe to call here
              const vid = cameraRef.current;
              if (!vid || vid.videoWidth === 0) return;
              const cap = document.createElement('canvas');
              cap.width = vid.videoWidth; cap.height = vid.videoHeight;
              cap.getContext('2d')?.drawImage(vid, 0, 0);
              cap.toBlob(blob => {
                if (!blob) return;
                const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
                setCapturedImage(file);
                setPreviewUrl(URL.createObjectURL(file));
                // stop stream inline so we don't depend on stopCamera ref
                if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null; }
                streamRef.current?.getTracks().forEach(t => t.stop());
                streamRef.current = null;
                setCameraOpen(false);
                setCameraReady(false);
                stableMsRef.current = 0;
                setStableMs(0);
              }, 'image/jpeg', 0.92);
            } else {
              setAutoCountdown(count);
            }
          }, 900);
        }
      }
      prevFrameRef.current = curr;
    }, 200);

    return () => {
      if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraReady, autoCapture]);

  // videoRefCallback: called by React the instant the <video> DOM element is created.
  // This is more reliable than useEffect because React guarantees it fires synchronously
  // after mount — no timing gap, no null-ref race condition.
  const videoRefCallback = useCallback((node: HTMLVideoElement | null) => {
    cameraRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {
        // play() is rejected on some browsers if the gesture chain is broken;
        // onPlaying + autoPlay + playsInline + muted should allow it in practice.
      });
    }
  }, []);

  async function openCamera() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setCameraOpen(true); // triggers the useEffect above to attach the stream
    } catch {
      setError('Camera access denied or unavailable. Please allow camera access and try again.');
    }
  }

  function capturePhoto() {
    const video = cameraRef.current;
    // Guard: video must be playing and have valid dimensions
    if (!video || video.videoWidth === 0 || video.readyState < 2) {
      setError('Camera is still loading — please wait a moment and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) { setError('Failed to capture photo. Please try again.'); return; }
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
      setCapturedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      stopCamera();
    }, 'image/jpeg', 0.92);
  }

  function retakePhoto() {
    setCapturedImage(null);
    setPreviewUrl('');
  }

  // ── submit to AI ──────────────────────────────────────────────────────────
  async function submitForAI() {
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
      setStep('open');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════════════

  // ── loading ────────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="py-8 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-500 text-sm">Starting work…</p>
      </div>
    );
  }

  // ── completed ──────────────────────────────────────────────────────────────
  if (step === 'completed') {
    return (
      <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <div className="text-3xl mb-2">✅</div>
        <p className="text-green-400 font-semibold">Stage completed</p>
        <p className="text-zinc-500 text-xs mt-1">This unit has moved to the next stage.</p>
      </div>
    );
  }

  // ── idle (manual fallback) ─────────────────────────────────────────────────
  if (step === 'idle') {
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl p-3 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={startWork}
          disabled={startingWork}
          className="w-full py-5 rounded-2xl font-bold text-sm flex flex-col items-center gap-2 disabled:opacity-50"
          style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}
        >
          {startingWork ? (
            <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
          {startingWork ? 'Starting…' : `Start ${stageLabel}`}
        </button>
      </div>
    );
  }

  // ── result screen (full-screen) ────────────────────────────────────────────
  if (step === 'result' && result) {
    const pass = result.result === 'PASS';
    const issues = result.issues as Issue[];

    return (
      <div
        className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
        style={{ background: '#0a0a0f' }}
      >
        {/* Result banner */}
        <div className="p-6 text-center flex-shrink-0">
          <div className="text-5xl mb-3">{pass ? '✅' : '❌'}</div>
          <p className={`text-xl font-bold ${pass ? 'text-green-400' : 'text-red-400'}`}>
            {pass ? 'All Clear — Stage Complete!' : 'Component Issues Found'}
          </p>
          <p className="text-zinc-400 text-sm mt-2 max-w-sm mx-auto leading-relaxed">{result.summary}</p>
          {pass && submission?.buildTimeSec && (
            <p className="text-zinc-500 text-xs mt-2">Build time: {fmtDuration(submission.buildTimeSec)}</p>
          )}
        </div>

        {/* Per-component breakdown */}
        {issues.length > 0 && (() => {
          // Helpers for the 5-status system
          const statusMeta: Record<string, { bg: string; border: string; text: string; icon: string; label: string }> = {
            PRESENT:          { bg: 'rgba(34,197,94,0.06)',   border: 'rgba(34,197,94,0.18)',   text: '#4ade80', icon: '✅', label: 'OK'          },
            MISSING:          { bg: 'rgba(239,68,68,0.07)',   border: 'rgba(239,68,68,0.2)',    text: '#f87171', icon: '❌', label: 'MISSING'     },
            DEFECTIVE:        { bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.2)',   text: '#fbbf24', icon: '⚠️', label: 'DEFECTIVE'  },
            WRONG_ORIENTATION:{ bg: 'rgba(251,146,60,0.07)',  border: 'rgba(251,146,60,0.2)',   text: '#fb923c', icon: '🔄', label: 'ORIENTATION' },
            SOLDER_ISSUE:     { bg: 'rgba(192,132,252,0.07)', border: 'rgba(192,132,252,0.2)',  text: '#c084fc', icon: '🔧', label: 'SOLDER'     },
            MISPLACED:        { bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.2)',   text: '#fbbf24', icon: '📍', label: 'MISPLACED'  },
          };
          const getMeta = (s: string) => statusMeta[s] ?? statusMeta['DEFECTIVE'];

          const failIssues = issues.filter(c => c.status !== 'PRESENT');
          const okIssues   = issues.filter(c => c.status === 'PRESENT');

          return (
            <div className="px-4 pb-4 space-y-4">
              {/* Issues first */}
              {failIssues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-red-400/70">
                    {failIssues.length} Issue{failIssues.length !== 1 ? 's' : ''} Found
                  </h4>
                  {failIssues.map((issue, i) => {
                    const m = getMeta(issue.status);
                    return (
                      <div key={i} className="rounded-xl p-3" style={{ background: m.bg, border: `1px solid ${m.border}` }}>
                        <div className="flex items-start gap-3">
                          <span className="text-lg shrink-0 mt-0.5">{m.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-white">{issue.name}</p>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: m.border, color: m.text }}>{m.label}</span>
                            </div>
                            {issue.note && <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{issue.note}</p>}
                            {issue.location && (
                              <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
                                <span>📍</span>{issue.location}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* OK components collapsed */}
              {okIssues.length > 0 && (
                <details className="group">
                  <summary className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 cursor-pointer select-none list-none flex items-center gap-1.5">
                    <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                    {okIssues.length} component{okIssues.length !== 1 ? 's' : ''} OK
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {okIssues.map((issue, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.1)' }}>
                        <span className="text-sm">✅</span>
                        <p className="text-xs text-zinc-400 font-medium flex-1">{issue.name}</p>
                        {issue.location && <p className="text-[10px] text-zinc-600">{issue.location}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })()}

        {/* Actions */}
        <div className="p-4 pb-safe mt-auto" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          {!pass ? (
            <button
              type="button"
              onClick={() => { retakePhoto(); setResult(null); setStep('open'); }}
              className="w-full py-4 rounded-2xl font-bold text-sm"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
            >
              Fix issues and retake photo →
            </button>
          ) : (
            <div
              className="w-full py-4 rounded-2xl text-center text-sm font-semibold text-green-400"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              Moving to next stage…
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── analyzing ──────────────────────────────────────────────────────────────
  if (step === 'analyzing') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6" style={{ background: '#0a0a0f' }}>
        <div className="relative">
          <div className="w-20 h-20 border-4 border-sky-400/30 rounded-full" />
          <div className="absolute inset-0 w-20 h-20 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-white font-semibold text-lg">AI is inspecting…</p>
          <p className="text-zinc-500 text-sm">Checking component placement and quality</p>
        </div>
        {previewUrl && (
          <div className="rounded-xl overflow-hidden opacity-30 w-32 h-24 relative">
            <Image src={previewUrl} alt="Analyzing" fill className="object-cover" />
          </div>
        )}
      </div>
    );
  }

  // ── open: full-screen work panel ───────────────────────────────────────────
  if (step === 'open') {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: '#0a0a0f' }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 flex-shrink-0"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)', paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest">{stageLabel}</p>
            {submission && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <LiveTimer startedAt={submission.startedAt} />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStep('working')}
            className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto" style={{ paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 16px), 24px)' }}>
          {error && (
            <div className="rounded-xl p-3 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          {!previewUrl ? (
            /* Photo capture area */
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <div className="text-center space-y-2">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)' }}
                >
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <p className="text-white font-semibold">Take a photo of your work</p>
                <p className="text-zinc-500 text-xs">The AI will verify component placement and quality</p>
              </div>
              <button
                type="button"
                onClick={openCamera}
                className="w-full py-6 rounded-2xl flex flex-col items-center gap-3 text-sky-400 font-semibold text-sm"
                style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.3)' }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Open Camera
              </button>
            </div>
          ) : (
            /* Photo preview + action buttons */
            <div className="flex-1 flex flex-col gap-3">
              {/* Image */}
              <div className="relative rounded-2xl overflow-hidden" style={{ minHeight: 220, border: '1px solid rgba(14,165,233,0.2)' }}>
                <Image src={previewUrl} alt="Work photo" fill className="object-cover" />
                {/* overlay badge */}
                <div className="absolute top-3 left-3">
                  <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.65)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
                    📸 Photo captured
                  </span>
                </div>
              </div>

              {/* Action buttons — always visible directly below the preview */}
              <button
                type="button"
                onClick={submitForAI}
                className="w-full py-4 rounded-2xl font-bold text-base"
                style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: 'white' }}
              >
                ✅ Submit — Run AI Check
              </button>
              <button
                type="button"
                onClick={() => { setCapturedImage(null); setPreviewUrl(''); }}
                className="w-full py-3 rounded-2xl text-sm font-medium text-zinc-400"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Retake photo
              </button>
            </div>
          )}
        </div>

        {/* Live camera overlay — fixed + z-[200] so it covers the bottom nav (z-50) */}
        {cameraOpen && (
          <div className="fixed inset-0 z-[200] bg-black flex flex-col">
            {/* Scan-line keyframe — scoped to this overlay */}
            <style>{`
              @keyframes swf-scan {
                0%   { top: 0%; opacity: 1; }
                48%  { opacity: 1; }
                50%  { top: calc(100% - 2px); opacity: 0.4; }
                52%  { opacity: 1; }
                100% { top: 0%; opacity: 1; }
              }
              @keyframes swf-corner-pulse {
                0%, 100% { opacity: 1; }
                50%       { opacity: 0.55; }
              }
            `}</style>

            {/* Camera header */}
            <div
              className="flex justify-between items-center px-4 flex-shrink-0 gap-3"
              style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)', paddingBottom: 12 }}
            >
              {/* Status dot + label */}
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: cameraReady ? '#22c55e' : '#f59e0b',
                    boxShadow: cameraReady ? '0 0 6px #22c55e' : '0 0 6px #f59e0b',
                    animation: 'pulse 1.5s infinite',
                  }}
                />
                <p className="text-white text-sm font-semibold truncate">
                  {cameraReady
                    ? autoCapture
                      ? stableMs >= 1500
                        ? '3… 2… 1…'
                        : stableMs >= 800
                        ? 'Hold steady…'
                        : 'Auto — align board'
                      : 'Manual capture'
                    : 'Starting camera…'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* AUTO / MANUAL toggle */}
                <button
                  type="button"
                  onClick={() => setAutoCapture(p => !p)}
                  className="px-3 py-1 rounded-full text-xs font-bold transition-all"
                  style={{
                    background: autoCapture ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                    border: autoCapture ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(255,255,255,0.12)',
                    color: autoCapture ? '#4ade80' : 'rgba(255,255,255,0.45)',
                  }}
                >
                  {autoCapture ? '⚡ Auto' : 'Manual'}
                </button>

                {/* Close */}
                <button
                  type="button"
                  onClick={stopCamera}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Video feed + scanning overlay + shutter button — all in one layer */}
            <div className="flex-1 relative overflow-hidden bg-black" style={{ minHeight: 0 }}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRefCallback}
                className="w-full h-full object-cover"
                muted
                playsInline
                autoPlay
                onPlaying={() => setCameraReady(true)}
              />

              {/* Loading state */}
              {!cameraReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
                  <div className="w-12 h-12 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-amber-400 text-sm font-medium">Initialising camera…</p>
                </div>
              )}

              {/* ── Scanning overlay + capture button — shown once camera is live ── */}
              {cameraReady && (
                <>
                  {/* Soft dark vignette around edges */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 50%, rgba(0,0,0,0.68) 100%)' }}
                  />

                  {/* Scan frame — centred, sits above the shutter area */}
                  <div
                    className="absolute inset-x-0 top-0 pointer-events-none flex items-center justify-center"
                    style={{ bottom: 140 }}
                  >
                    <div className="relative" style={{ width: 272, height: 200 }}>
                      {/* Top-left */}
                      <div className="absolute top-0 left-0 w-8 h-8" style={{ borderTop: '2.5px solid #38bdf8', borderLeft: '2.5px solid #38bdf8', borderRadius: '4px 0 0 0', animation: 'swf-corner-pulse 2s ease-in-out infinite' }} />
                      {/* Top-right */}
                      <div className="absolute top-0 right-0 w-8 h-8" style={{ borderTop: '2.5px solid #38bdf8', borderRight: '2.5px solid #38bdf8', borderRadius: '0 4px 0 0', animation: 'swf-corner-pulse 2s ease-in-out infinite 0.5s' }} />
                      {/* Bottom-left */}
                      <div className="absolute bottom-0 left-0 w-8 h-8" style={{ borderBottom: '2.5px solid #38bdf8', borderLeft: '2.5px solid #38bdf8', borderRadius: '0 0 0 4px', animation: 'swf-corner-pulse 2s ease-in-out infinite 1s' }} />
                      {/* Bottom-right */}
                      <div className="absolute bottom-0 right-0 w-8 h-8" style={{ borderBottom: '2.5px solid #38bdf8', borderRight: '2.5px solid #38bdf8', borderRadius: '0 0 4px 0', animation: 'swf-corner-pulse 2s ease-in-out infinite 1.5s' }} />
                      {/* Centre crosshair */}
                      <div className="absolute inset-0 flex items-center justify-center"><div className="w-5 h-px" style={{ background: 'rgba(56,189,248,0.35)' }} /></div>
                      <div className="absolute inset-0 flex items-center justify-center"><div className="h-5 w-px" style={{ background: 'rgba(56,189,248,0.35)' }} /></div>
                      {/* Sweep scan line */}
                      <div className="absolute left-0 right-0" style={{ height: 2, top: 0, background: 'linear-gradient(90deg, transparent 0%, #7dd3fc 25%, #38bdf8 50%, #7dd3fc 75%, transparent 100%)', boxShadow: '0 0 10px 3px rgba(56,189,248,0.55)', animation: 'swf-scan 2.4s cubic-bezier(0.4,0,0.6,1) infinite' }} />
                    </div>
                  </div>

                  {/* ── Shutter area — stability ring + button + label ── */}
                  <div
                    className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3"
                    style={{
                      paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 100px), 110px)',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
                      paddingTop: 52,
                    }}
                  >
                    {/* Button with stability ring overlaid */}
                    <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>

                      {/* Stability ring SVG — rotated so fill starts at top */}
                      {(() => {
                        const r = 42;
                        const circ = 2 * Math.PI * r; // ≈ 264
                        const pct  = stableMs / 1500;
                        const ringColor = stableMs >= 1500 ? '#4ade80' : stableMs > 800 ? '#fbbf24' : '#38bdf8';
                        return (
                          <svg
                            width="88" height="88"
                            viewBox="0 0 88 88"
                            className="absolute inset-0"
                            style={{ transform: 'rotate(-90deg)' }}
                          >
                            {/* Track */}
                            <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                            {/* Fill */}
                            <circle
                              cx="44" cy="44" r={r} fill="none"
                              stroke={ringColor}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={`${pct * circ} ${circ}`}
                              style={{ transition: 'stroke-dasharray 0.2s ease, stroke 0.4s ease', filter: stableMs >= 1500 ? `drop-shadow(0 0 4px ${ringColor})` : 'none' }}
                            />
                          </svg>
                        );
                      })()}

                      {/* Shutter button */}
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="flex items-center justify-center transition-transform active:scale-90"
                        style={{
                          width: 68, height: 68,
                          borderRadius: '50%',
                          background: autoCountdown !== null ? '#4ade80' : 'white',
                          boxShadow: autoCountdown !== null
                            ? '0 0 0 4px rgba(74,222,128,0.3), 0 8px 24px rgba(0,0,0,0.5)'
                            : '0 0 0 4px rgba(255,255,255,0.2), 0 8px 24px rgba(0,0,0,0.5)',
                          transition: 'background 0.3s ease, box-shadow 0.3s ease',
                        }}
                        aria-label="Capture photo"
                      >
                        {autoCountdown !== null ? (
                          /* Countdown number */
                          <span className="text-2xl font-black text-black leading-none">{autoCountdown}</span>
                        ) : (
                          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Dynamic status label */}
                    <span className="text-xs font-medium text-center px-4" style={{ color: 'rgba(255,255,255,0.65)' }}>
                      {autoCapture
                        ? autoCountdown !== null
                          ? 'Capturing…'
                          : stableMs >= 1200
                          ? 'Hold perfectly still!'
                          : stableMs >= 600
                          ? 'Almost steady — keep holding…'
                          : 'Align PCB · hold steady to auto-capture'
                        : 'Tap button to capture'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    );
  }

  // ── working: "Open Work" button + timer ────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Timer chip */}
      {submission && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl w-fit"
          style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-zinc-500 text-xs">Working</span>
          <LiveTimer startedAt={submission.startedAt} />
        </div>
      )}

      {/* Open Work button */}
      <button
        type="button"
        onClick={() => setStep('open')}
        className="w-full py-5 rounded-2xl font-bold text-base flex items-center justify-center gap-3"
        style={{
          background: 'linear-gradient(135deg, rgba(14,165,233,0.15), rgba(99,102,241,0.15))',
          border: '1px solid rgba(14,165,233,0.35)',
          color: '#38bdf8',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          <line x1="12" y1="12" x2="12" y2="16" />
          <line x1="10" y1="14" x2="14" y2="14" />
        </svg>
        Open Work
      </button>

      <p className="text-zinc-600 text-xs text-center">Take a photo when done · AI will verify placement</p>
    </div>
  );
}
