'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ImageEnhancer } from '@/components/ImageEnhancer';

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
  orderId: string | null;
  powerstageBarcode?: string | null;
  brainboardBarcode?: string | null;
};

function fmtDuration(sec: number) {
  if (!sec || isNaN(sec) || sec < 0) return '0s';
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
    if (isNaN(start)) return;
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return <span className="font-mono text-amber-400 font-bold">{fmtDuration(elapsed)}</span>;
}

// ── Smart PCB framing ──────────────────────────────────────────────────────
// Detects the PCB rectangle by comparing each pixel against the average
// background colour (sampled from the four image corners) and crops to the
// bounding box of pixels that differ enough.  Falls back to the original blob
// when detection fails or the board already fills most of the frame.
async function smartCropPCB(blob: Blob): Promise<Blob> {
  return new Promise<Blob>((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const W = img.naturalWidth;
      const H = img.naturalHeight;

      // Down-sample to ≤320 px for speed
      const SCALE = Math.min(1, 320 / Math.max(W, H));
      const sw = Math.round(W * SCALE);
      const sh = Math.round(H * SCALE);

      const cv = document.createElement('canvas');
      cv.width = sw; cv.height = sh;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      if (!cx) { resolve(blob); return; }
      cx.drawImage(img, 0, 0, sw, sh);
      const { data } = cx.getImageData(0, 0, sw, sh);

      // Average the TOP two corners + a thin top-edge strip for background.
      // We deliberately ignore bottom corners because workers often hold the
      // phone over the PCB — their legs/floor appear at the bottom and would
      // contaminate the background estimate.
      const P = 10;
      // Top-left, top-right corners + centre strip at very top
      const bgSamples: [number, number][] = [
        [0, 0], [sw - P, 0],
        // additional horizontal strip along top edge (every 8th column)
        ...Array.from({ length: Math.floor(sw / 8) }, (_, k): [number, number] => [k * 8, 0]),
      ];
      let br = 0, bg = 0, bb = 0;
      let n = 0;
      for (const [sx, sy] of bgSamples) {
        for (let y = sy; y < sy + P && y < sh; y++) {
          for (let x = sx; x < sx + P && x < sw; x++) {
            const i = (y * sw + x) * 4;
            br += data[i]; bg += data[i + 1]; bb += data[i + 2];
            n++;
          }
        }
      }
      br /= n; bg /= n; bb /= n;

      // Bounding box of foreground pixels (differ from background by > threshold)
      const THRESH = 35;
      let x0 = sw, y0 = sh, x1 = 0, y1 = 0;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = (y * sw + x) * 4;
          if (Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb) > THRESH) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }

      const cropW = x1 - x0;
      const cropH = y1 - y0;
      // Skip crop if: detection failed, PCB fills almost the entire width AND
      // height (already well-framed), or detected area is suspiciously tiny.
      // Use separate thresholds: 92% width AND 88% height — if jeans/floor
      // extend the height bounding box the width check still triggers a crop.
      if (
        x0 >= x1 || y0 >= y1 ||
        (cropW / sw > 0.92 && cropH / sh > 0.88) ||
        (cropW * cropH) / (sw * sh) < 0.04
      ) {
        resolve(blob);
        return;
      }

      // 8% padding, clamped to image bounds, scaled back to original resolution
      const padX = Math.round(cropW * 0.08);
      const padY = Math.round(cropH * 0.08);
      const fx0 = Math.max(0, Math.round((x0 - padX) / SCALE));
      const fy0 = Math.max(0, Math.round((y0 - padY) / SCALE));
      const fw  = Math.min(W, Math.round((x1 + padX) / SCALE)) - fx0;
      const fh  = Math.min(H, Math.round((y1 + padY) / SCALE)) - fy0;

      const out = document.createElement('canvas');
      out.width = fw; out.height = fh;
      out.getContext('2d')!.drawImage(img, fx0, fy0, fw, fh, 0, 0, fw, fh);
      out.toBlob(b => resolve(b ?? blob), 'image/jpeg', 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}

export function StageWorkFlow({ unitId, currentStage, currentStatus, orderId, powerstageBarcode, brainboardBarcode }: Props) {
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
  const [enhancedBlob, setEnhancedBlob] = useState<Blob | null>(null);
  const [result, setResult] = useState<{ result: string; issues: Issue[]; summary: string } | null>(null);
  const [error, setError] = useState('');
  const [startingWork, setStartingWork] = useState(false);


  // ── multi-zone photo wizard ────────────────────────────────────────────────
  const [zones, setZones]         = useState<string[]>(['full']); // fetched from GET
  const [zoneZooms, setZoneZooms] = useState<Record<string, number>>({ full: 1 }); // auto-zoom per zone
  const [photoStep, setPhotoStep] = useState(0);                  // current zone index
  const [zonePhotos, setZonePhotos] = useState<Record<string, File>>({}); // zone → captured file
  // Ref mirror so openCamera (inside stale closures) always reads current zoom
  const zoneZoomsRef = useRef<Record<string, number>>({ full: 1 });

  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen]   = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  // ── auto-capture state ────────────────────────────────────────────────────
  const [autoCapture, setAutoCapture]     = useState(true);
  const [stableMs, setStableMs]           = useState(0);          // 0–1500
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null); // 3,2,1

  // ── PCB check state ────────────────────────────────────────────────────────
  // pcbChecking / pcbError disabled until RPi high-res cameras arrive —
  // phone cameras can't reliably gate on PCB presence. Re-enable with hardware.
  const prevFrameRef    = useRef<ImageData | null>(null);
  const frameTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const stableMsRef     = useRef(0);
  const autoCapturedRef = useRef(false);

  const stageLabel = currentStage.replace(/_/g, ' ');

  // ── zone info lookup ───────────────────────────────────────────────────────
  const ZONE_INFO: Record<string, { title: string; hint: string; icon: string }> = {
    full:   { icon: '', title: 'Full Board Photo',   hint: 'Hold phone ~40 cm above — fit the entire PCB in frame' },
    top:    { icon: '', title: 'Top Close-up',       hint: 'Move in to ~10–15 cm — small components should fill the frame' },
    bottom: { icon: '', title: 'Bottom Close-up',    hint: 'Move in to ~10–15 cm — small components should fill the frame' },
  };

  // ── fetch zones + zoom hints for this stage ───────────────────────────────
  useEffect(() => {
    fetch(`/api/units/${unitId}/work`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.zones) && data.zones.length > 0) setZones(data.zones);
        if (data.zoneZooms && typeof data.zoneZooms === 'object') {
          setZoneZooms(data.zoneZooms);
          zoneZoomsRef.current = data.zoneZooms; // sync ref — avoids stale closure in openCamera
        }
      })
      .catch(() => {});
  }, [unitId]);

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
              .then(d => {
                if (d?.id) { setSubmission(d); setStep('working'); }
                else { setStep('idle'); }
              });
          }
        })
        .catch(() => setStep('idle'));
      return;
    }

    if (currentStatus !== 'PENDING') {
      // BLOCKED, WAITING_APPROVAL, REJECTED_BACK, etc. — cannot start work
      setStep('idle');
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
              cap.toBlob(async (blob) => {
                if (!blob) return;
                const cropped = await smartCropPCB(blob);
                const file = new File([cropped], 'capture.jpg', { type: 'image/jpeg' });
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
    // Store current zone so any closures that fire later can read it without staleness
    const zone = zones[photoStep] ?? 'full';
    (window as unknown as Record<string, string>)['__captureZone'] = zone;
    // Read suggested zoom from ref (never stale even in effect closures)
    const suggestedZoom = zoneZoomsRef.current[zone] ?? 1;
    try {
      // On Android Chrome we can request native zoom at capture time
      const constraints: MediaStreamConstraints = {
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      };
      if (suggestedZoom > 1) {
        (constraints.video as Record<string, unknown>)['zoom'] = suggestedZoom;
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints).catch(() =>
        // Fallback without zoom constraint (iOS Safari doesn't support it at getUserMedia time)
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
      );
      streamRef.current = stream;
      setCameraOpen(true);
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
    canvas.toBlob(async (blob) => {
      if (!blob) { setError('Failed to capture photo. Please try again.'); return; }
      const cropped = await smartCropPCB(blob);
      const file = new File([cropped], 'capture.jpg', { type: 'image/jpeg' });
      setCapturedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      stopCamera();
    }, 'image/jpeg', 0.92);
  }

  function retakePhoto() {
    setCapturedImage(null);
    setPreviewUrl('');
  }

  // ── multi-zone: confirm current photo and advance to next zone ───────────
  function confirmAndNext() {
    if (!capturedImage) return;
    const zone = zones[photoStep] ?? 'full';
    setZonePhotos(prev => ({ ...prev, [zone]: capturedImage }));
    setCapturedImage(null);
    setPreviewUrl('');
    setEnhancedBlob(null);
    setPhotoStep(p => p + 1);
  }

  // ── submit to AI (single-zone — backward compatible) ──────────────────────
  async function submitForAI() {
    if (!capturedImage || !submission) return;
    const fileToSend = enhancedBlob
      ? new File([enhancedBlob], 'capture.jpg', { type: 'image/jpeg' })
      : capturedImage;
    const fd = new FormData();
    fd.append('image', fileToSend);
    fd.append('submissionId', submission.id);
    setStep('analyzing'); setError('');
    try {
      const res = await fetch(`/api/units/${unitId}/work`, { method: 'PUT', body: fd });
      const data = await res.json();
      if (!res.ok) {
        // Server returned an error — show it and let the worker retry
        setError(data.error ?? `Submission failed (${res.status}). Please try again.`);
        setStep('open');
        return;
      }
      setResult({ result: data.result, issues: data.issues ?? [], summary: data.summary });
      setStep('result');
      if (data.result === 'PASS') setTimeout(() => orderId ? router.push(`/orders/${orderId}`) : router.refresh(), 2000);
    } catch {
      setError('Submission failed. Please try again.');
      setStep('open');
    }
  }

  // ── submit all zone photos (multi-zone) ───────────────────────────────────
  async function submitAllZones(photos: Record<string, File>) {
    if (!submission || Object.keys(photos).length === 0) return;
    setStep('analyzing'); setError('');
    const fd = new FormData();
    fd.append('submissionId', submission.id);
    if (photos['full'])   fd.append('image',  photos['full']);
    if (photos['top'])    fd.append('file2',  photos['top']);
    if (photos['bottom']) fd.append('file3',  photos['bottom']);
    try {
      const res = await fetch(`/api/units/${unitId}/work`, { method: 'PUT', body: fd });
      const data = await res.json();
      if (!res.ok) {
        // Server returned an error — show it and let the worker retry
        setError(data.error ?? `Submission failed (${res.status}). Please try again.`);
        setStep('open');
        return;
      }
      setResult({ result: data.result, issues: data.issues ?? [], summary: data.summary });
      setStep('result');
      if (data.result === 'PASS') setTimeout(() => orderId ? router.push(`/orders/${orderId}`) : router.refresh(), 2000);
    } catch {
      setError('Submission failed. Please try again.');
      setStep('open');
    }
  }

  // ── last zone: capture + immediately submit ───────────────────────────────
  function submitLastZonePhoto() {
    if (!capturedImage || !submission) return;
    const zone = zones[photoStep] ?? 'full';
    const finalPhotos = { ...zonePhotos, [zone]: capturedImage };
    setZonePhotos(finalPhotos);
    setCapturedImage(null); setPreviewUrl(''); setEnhancedBlob(null);
    submitAllZones(finalPhotos);
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
    const pass       = result.result === 'PASS';
    const aiError    = result.summary?.startsWith('AI_UNAVAILABLE');
    const notABoard  = result.summary?.includes('[NOT_A_BOARD]');
    const noCriteria = result.summary?.startsWith('[NO_CRITERIA]');
    const issues     = result.issues as Issue[];
    // Extract the error hint from the summary (everything after 'AI_UNAVAILABLE: ')
    const aiErrorDetail = aiError ? (result.summary ?? '').replace('AI_UNAVAILABLE: ', '') : '';
    const displaySummary = noCriteria
      ? 'No inspection checklist has been configured for this stage yet. Contact an admin to set up the checklist items.'
      : notABoard
      ? 'The photo doesn\'t appear to show a circuit board. Please retake with the correct PCB in the camera frame.'
      : aiError
      ? 'Photo saved. AI inspection failed — a manager must review this unit manually.'
      : !pass
      ? (result.summary ?? 'Something went wrong. Please retake the photo and try again.')
      : result.summary;

    return (
      <div
        className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
        style={{ background: '#0a0a0f' }}
      >
        {/* Result banner */}
        <div className="p-6 text-center flex-shrink-0">
          <p className={`text-xl font-bold ${noCriteria ? 'text-amber-400' : notABoard ? 'text-orange-400' : aiError ? 'text-amber-400' : pass ? 'text-green-400' : 'text-red-400'}`}>
            {noCriteria ? 'No Checklist Configured' : notABoard ? 'Invalid Photo' : aiError ? 'Photo Saved — Awaiting Review' : pass ? 'All Clear — Stage Complete!' : 'Submission Failed'}
          </p>
          <p className="text-zinc-400 text-sm mt-2 max-w-sm mx-auto leading-relaxed">{displaySummary}</p>
          {noCriteria && (
            <div className="mt-3 mx-auto max-w-xs">
              <div className="rounded-xl px-4 py-2 text-xs font-medium text-amber-300"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                Go to Admin &rarr; Checklists to configure inspection items for this stage
              </div>
            </div>
          )}
          {notABoard && !noCriteria && (
            <div className="mt-3 mx-auto max-w-xs">
              <div className="rounded-xl px-4 py-2 text-xs font-medium text-orange-300"
                style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)' }}>
                Point the camera at the PCB board and ensure it fills the frame
              </div>
            </div>
          )}
          {aiError && (
            <div className="mt-3 mx-auto max-w-xs space-y-2">
              <div className="rounded-xl px-4 py-2 text-xs font-medium text-amber-300"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                Unit held for manager approval
              </div>
              {aiErrorDetail && (
                <div className="rounded-xl px-3 py-2 text-[11px] text-zinc-500 text-left leading-relaxed"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {aiErrorDetail}
                </div>
              )}
            </div>
          )}
          {pass && !aiError && submission?.buildTimeSec && (
            <p className="text-zinc-500 text-xs mt-2">Build time: {fmtDuration(submission.buildTimeSec)}</p>
          )}
        </div>

        {/* Per-component breakdown */}
        {issues.length > 0 && (() => {
          // Helpers for the 5-status system
          const statusMeta: Record<string, { bg: string; border: string; text: string; icon: string; label: string }> = {
            PRESENT:          { bg: 'rgba(34,197,94,0.06)',   border: 'rgba(34,197,94,0.18)',   text: '#4ade80', icon: '·', label: 'OK'          },
            MISSING:          { bg: 'rgba(239,68,68,0.07)',   border: 'rgba(239,68,68,0.2)',    text: '#f87171', icon: '·', label: 'MISSING'     },
            DEFECTIVE:        { bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.2)',   text: '#fbbf24', icon: '·', label: 'DEFECTIVE'  },
            WRONG_ORIENTATION:{ bg: 'rgba(251,146,60,0.07)',  border: 'rgba(251,146,60,0.2)',   text: '#fb923c', icon: '·', label: 'ORIENTATION' },
            SOLDER_ISSUE:     { bg: 'rgba(192,132,252,0.07)', border: 'rgba(192,132,252,0.2)',  text: '#c084fc', icon: '·', label: 'SOLDER'     },
            MISPLACED:        { bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.2)',   text: '#fbbf24', icon: '·', label: 'MISPLACED'  },
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
                                {issue.location}
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
                        <span className="text-sm text-green-500">·</span>
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
        <div className="p-4 pb-safe mt-auto space-y-3" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          {noCriteria ? (
            /* No checklist configured — admin needs to set it up */
            <>
              <div
                className="w-full py-4 rounded-2xl text-center text-sm font-semibold text-amber-400"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}
              >
                Admin must configure checklist first
              </div>
              <button
                type="button"
                onClick={() => router.back()}
                className="w-full py-3 rounded-2xl font-semibold text-sm text-zinc-400"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Back to Unit
              </button>
            </>
          ) : notABoard ? (
            /* Photo doesn't show a PCB — retake required */
            <>
              <div
                className="w-full py-4 rounded-2xl text-center text-sm font-semibold text-orange-400"
                style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)' }}
              >
                Photo must show a circuit board
              </div>
              <button
                type="button"
                onClick={() => { setCapturedImage(null); setPreviewUrl(''); setEnhancedBlob(null); setZonePhotos({}); setPhotoStep(0); setResult(null); setStep('open'); }}
                className="w-full py-4 rounded-2xl font-bold text-sm"
                style={{ background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.3)', color: '#fb923c' }}
              >
                Retake Photo →
              </button>
            </>
          ) : aiError ? (
            /* AI unavailable — photo saved, manager will review */
            <>
              <div
                className="w-full py-4 rounded-2xl text-center text-sm font-semibold text-amber-400"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}
              >
                Waiting for manager review
              </div>
              <button
                type="button"
                onClick={() => { setCapturedImage(null); setPreviewUrl(''); setEnhancedBlob(null); setZonePhotos({}); setPhotoStep(0); setResult(null); setStep('open'); }}
                className="w-full py-3 rounded-2xl font-semibold text-sm text-zinc-400"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Retake photo
              </button>
            </>
          ) : !pass ? (
            <button
              type="button"
              onClick={() => { setCapturedImage(null); setPreviewUrl(''); setEnhancedBlob(null); setZonePhotos({}); setPhotoStep(0); setResult(null); setStep('open'); }}
              className="w-full py-4 rounded-2xl font-bold text-sm"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
            >
              Retake Photo →
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
          <p className="text-white font-semibold text-lg">Processing photo…</p>
          <p className="text-zinc-500 text-sm">Uploading and running quality check</p>
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

          {/* ── Multi-zone step indicator ───────────────────────────────────── */}
          {zones.length > 1 && (
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                {zones.map((z, i) => (
                  <div
                    key={z}
                    className="h-1.5 rounded-full flex-1 transition-all duration-300"
                    style={{
                      background: i < photoStep
                        ? '#22c55e'
                        : i === photoStep
                        ? '#38bdf8'
                        : 'rgba(255,255,255,0.1)',
                    }}
                  />
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 text-center">
                {photoStep >= zones.length
                  ? 'All photos captured'
                  : `Photo ${photoStep + 1} of ${zones.length} — ${ZONE_INFO[zones[photoStep]]?.title ?? zones[photoStep]}`}
              </p>
            </div>
          )}

          {/* ── All zones captured — summary + submit ──────────────────────── */}
          {photoStep >= zones.length ? (
            <div className="flex-1 flex flex-col gap-4">
              <div className="text-center space-y-1 pt-2">
                <p className="text-green-400 font-bold text-base">All {zones.length} photos captured</p>
                <p className="text-zinc-500 text-xs">Ready to submit</p>
              </div>
              {/* Thumbnails */}
              <div className={`grid gap-2 ${zones.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {zones.map(z => {
                  const photo = zonePhotos[z];
                  const url   = photo ? URL.createObjectURL(photo) : null;
                  const info  = ZONE_INFO[z] ?? { icon: '📷', title: z };
                  return (
                    <div key={z} className="relative rounded-xl overflow-hidden flex flex-col">
                      <div className="relative w-full" style={{ aspectRatio: '4/3', background: 'rgba(255,255,255,0.04)' }}>
                        {url && <Image src={url} alt={z} fill className="object-cover" unoptimized />}
                      </div>
                      <p className="text-[10px] text-center py-1 text-zinc-400 font-medium">{info.title.split('—')[0].trim()}</p>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => submitAllZones(zonePhotos)}
                className="w-full py-4 rounded-2xl font-bold text-base"
                style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: 'white' }}
              >
                Submit Photos
              </button>
              <button
                type="button"
                onClick={() => { setZonePhotos({}); setPhotoStep(0); setCapturedImage(null); setPreviewUrl(''); setEnhancedBlob(null); }}
                className="w-full py-3 rounded-2xl text-sm font-medium text-zinc-400"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Retake all photos
              </button>
            </div>
          ) : !previewUrl ? (
            /* ── Photo capture area ─────────────────────────────────────────── */
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <div className="text-center space-y-2">
                <p className="text-white font-semibold text-base">
                  {ZONE_INFO[zones[photoStep] ?? 'full']?.title ?? 'Take a photo'}
                </p>
                <p className="text-zinc-500 text-xs px-4">
                  {ZONE_INFO[zones[photoStep] ?? 'full']?.hint ?? 'Photo will be saved to production record'}
                </p>
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
            /* ── Photo preview + action buttons ─────────────────────────────── */
            <div className="flex-1 flex flex-col gap-3">
              {/* Explicit height so h-full inside ImageEnhancer resolves correctly.
                  Caps at 45 vh so portrait photos don't push buttons off-screen. */}
              <div className="relative rounded-2xl overflow-hidden" style={{ maxHeight: 'min(65vh, 500px)', border: '1px solid rgba(14,165,233,0.2)' }}>
                <ImageEnhancer
                  src={previewUrl}
                  onEnhancedBlob={setEnhancedBlob}
                  minHeight={220}
                />
              </div>

              {/* Action buttons — PCB gate removed until RPi hardware arrives */}
              {zones.length === 1 ? (
                <button
                  type="button"
                  onClick={submitForAI}
                  className="w-full py-4 rounded-2xl font-bold text-base"
                  style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: 'white' }}
                >
                  Submit Photo
                </button>
              ) : photoStep + 1 < zones.length ? (
                <button
                  type="button"
                  onClick={confirmAndNext}
                  className="w-full py-4 rounded-2xl font-bold text-base"
                  style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', color: 'white' }}
                >
                  Use photo → Next: {ZONE_INFO[zones[photoStep + 1]]?.title ?? zones[photoStep + 1]}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submitLastZonePhoto}
                  className="w-full py-4 rounded-2xl font-bold text-base"
                  style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: 'white' }}
                >
                  Submit Photos
                </button>
              )}

              <button
                type="button"
                onClick={() => { setCapturedImage(null); setPreviewUrl(''); setEnhancedBlob(null); }}
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
                {/* Auto-zoom badge — only shown when zone has >1× suggested zoom */}
                {(() => {
                  const zone = zones[photoStep] ?? 'full';
                  const zoom = zoneZooms[zone] ?? 1;
                  return zoom > 1 ? (
                    <span className="px-2 py-1 rounded-full text-xs font-bold"
                      style={{ background: 'rgba(14,165,233,0.18)', border: '1px solid rgba(14,165,233,0.35)', color: '#38bdf8' }}>
                      {zoom.toFixed(1)}×
                    </span>
                  ) : null;
                })()}

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
                  {autoCapture ? 'Auto' : 'Manual'}
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
                    style={{ bottom: 320 }}
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
                      paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 160px), 172px)',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                      paddingTop: 24,
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

{/* Assembly stage: read-only pairing confirmation — barcodes already saved via selector */}
      {currentStage === 'CONTROLLER_ASSEMBLY' && (powerstageBarcode || brainboardBarcode) && (
        <div
          className="rounded-xl p-3 space-y-2"
          style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}
        >
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-green-400">
              Board Pairing Recorded
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>PS</span>
              <span className="font-mono text-xs text-indigo-300">{powerstageBarcode ?? '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>BB</span>
              <span className="font-mono text-xs text-amber-300">{brainboardBarcode ?? '—'}</span>
            </div>
          </div>
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

      <p className="text-zinc-600 text-xs text-center">Take a photo when done — saved to production record</p>
    </div>
  );
}
