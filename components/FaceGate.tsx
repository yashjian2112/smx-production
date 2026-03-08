'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { loadFaceModels, getFaceDescriptor, descriptorDistance, descriptorFromJson, descriptorToJson } from '@/lib/face-models';

type Mode = 'verify' | 'enroll';

type FaceGateProps = {
  mode?: Mode;
  userId?: string;
  onVerified?: () => void;
  onEnrolled?: () => void;
  onCancel: () => void;
  title?: string;
};

const MATCH_THRESHOLD = 0.60;
const SCAN_INTERVAL_MS = 300;

export function FaceGate({ mode = 'verify', userId, onVerified, onEnrolled, onCancel, title }: FaceGateProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [gateKey, setGateKey] = useState(0); // for retry remount

  const [status, setStatus] = useState<'loading' | 'scanning' | 'matched' | 'no_face' | 'mismatch' | 'no_descriptor' | 'error' | 'enrolling' | 'enrolled'>('loading');
  const [message, setMessage] = useState('Loading face models…');
  const [attempts, setAttempts] = useState(0);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStatus('loading');
        setMessage('Loading face models…');
        await loadFaceModels();
        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (mode === 'verify') {
          const res = await fetch('/api/me/face-descriptor');
          if (!res.ok) {
            setStatus('no_descriptor');
            setMessage('Face not enrolled. Ask your admin to enroll your face first.');
            return;
          }
          const { descriptor: descriptorJson } = await res.json();
          if (!descriptorJson) {
            setStatus('no_descriptor');
            setMessage('Face not enrolled. Ask your admin to enroll your face first.');
            return;
          }
          const stored = descriptorFromJson(descriptorJson);

          setStatus('scanning');
          setMessage('Look at the camera…');

          intervalRef.current = setInterval(async () => {
            if (!videoRef.current || cancelled) return;
            const desc = await getFaceDescriptor(videoRef.current);
            if (!desc) {
              setStatus('no_face');
              setMessage('No face detected — look directly at the camera');
              return;
            }
            const dist = descriptorDistance(desc, stored);
            if (dist < MATCH_THRESHOLD) {
              if (intervalRef.current) clearInterval(intervalRef.current);
              setStatus('matched');
              setMessage('Identity confirmed ✓');
              setTimeout(() => { stopCamera(); onVerified?.(); }, 800);
            } else {
              setAttempts((a) => {
                const next = a + 1;
                if (next >= 5) {
                  setStatus('mismatch');
                  setMessage('Face not recognised after 5 attempts');
                  if (intervalRef.current) clearInterval(intervalRef.current);
                } else {
                  setStatus('scanning');
                  setMessage(`Face not matching — hold still (${next}/5)`);
                }
                return next;
              });
            }
          }, SCAN_INTERVAL_MS);
        } else {
          setStatus('scanning');
          setMessage('Position your face in the oval frame…');

          intervalRef.current = setInterval(async () => {
            if (!videoRef.current || cancelled) return;
            const desc = await getFaceDescriptor(videoRef.current);
            if (desc) {
              if (intervalRef.current) clearInterval(intervalRef.current);
              setStatus('enrolling');
              setMessage('Saving face data…');
              try {
                const res = await fetch(`/api/users/${userId}/face-enroll`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ descriptor: descriptorToJson(desc) }),
                });
                if (res.ok) {
                  setStatus('enrolled');
                  setMessage('Face enrolled successfully ✓');
                  setTimeout(() => { stopCamera(); onEnrolled?.(); }, 1000);
                } else {
                  setStatus('error');
                  setMessage('Failed to save face data. Try again.');
                }
              } catch {
                setStatus('error');
                setMessage('Network error. Please retry.');
              }
            } else {
              setStatus('no_face');
              setMessage('No face detected — look directly at camera');
            }
          }, SCAN_INTERVAL_MS);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setMessage(
            err instanceof Error && err.name === 'NotAllowedError'
              ? 'Camera access denied — allow camera in browser settings'
              : 'Camera error. Please retry.'
          );
        }
      }
    })();

    return () => { cancelled = true; stopCamera(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, userId, gateKey]);

  function handleRetry() {
    setAttempts(0);
    setStatus('loading');
    setGateKey((k) => k + 1);
  }

  const isSuccess = status === 'matched' || status === 'enrolled';
  const isError = status === 'mismatch' || status === 'error' || status === 'no_descriptor';
  const isScanning = status === 'scanning' || status === 'loading' || status === 'enrolling' || status === 'no_face';

  // Oval border colour
  const ovalBorder = isSuccess ? '#22c55e' : isError ? '#ef4444' : '#38bdf8';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90">
      {/* Title */}
      <p className="text-white text-lg font-semibold mb-6 px-4 text-center">
        {title ?? (mode === 'enroll' ? 'Enroll Face' : 'Face Verification')}
      </p>

      {/* Camera + oval overlay */}
      <div className="relative" style={{ width: 300, height: 360 }}>
        {/* Video */}
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover rounded-[50%] scale-x-[-1]"
          style={{ borderRadius: '50% / 43%' }}
        />

        {/* Dark mask — oval cutout via clip-path */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'rgba(0,0,0,0.5)',
            clipPath: 'evenodd',
            WebkitClipPath: 'evenodd',
            // punch hole in the oval
            maskImage: `radial-gradient(ellipse 140px 168px at 50% 50%, transparent 99%, black 100%)`,
            WebkitMaskImage: `radial-gradient(ellipse 140px 168px at 50% 50%, transparent 99%, black 100%)`,
          }}
        />

        {/* Oval SVG border + scanning line */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 300 360"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Static oval border */}
          <ellipse
            cx="150" cy="180" rx="140" ry="168"
            stroke={ovalBorder}
            strokeWidth="3"
            opacity={isScanning ? 0.6 : 1}
          />

          {/* Corner accent marks */}
          {[
            { d: 'M 30 100 Q 10 12 100 12' },
            { d: 'M 270 100 Q 290 12 200 12' },
            { d: 'M 30 260 Q 10 348 100 348' },
            { d: 'M 270 260 Q 290 348 200 348' },
          ].map((a, i) => (
            <path key={i} d={a.d} stroke={ovalBorder} strokeWidth="4" strokeLinecap="round" fill="none" />
          ))}

          {/* Scanning sweep line (animated) */}
          {isScanning && (
            <ellipse
              cx="150" cy="180" rx="136" ry="164"
              stroke={ovalBorder}
              strokeWidth="1.5"
              strokeDasharray="40 900"
              opacity="0.9"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 150 180"
                to="360 150 180"
                dur="1.8s"
                repeatCount="indefinite"
              />
            </ellipse>
          )}

          {/* Success checkmark */}
          {isSuccess && (
            <g>
              <circle cx="150" cy="180" r="40" fill="#22c55e" opacity="0.25" />
              <path d="M 130 180 L 145 196 L 172 164" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
          )}
        </svg>

        {/* Scanning horizontal sweep bar */}
        {isScanning && (
          <div
            className="absolute left-0 right-0 h-0.5 pointer-events-none"
            style={{
              background: `linear-gradient(90deg, transparent, ${ovalBorder}99, transparent)`,
              animation: 'scanBar 2s ease-in-out infinite',
              borderRadius: 2,
            }}
          />
        )}
      </div>

      {/* Status message */}
      <p className={`mt-6 text-sm text-center px-6 ${
        isSuccess ? 'text-green-400' :
        isError ? 'text-red-400' :
        status === 'no_face' ? 'text-amber-400' :
        'text-slate-300'
      }`}>
        {message}
      </p>

      {/* Attempt dots for verify mode */}
      {mode === 'verify' && attempts > 0 && !isError && (
        <div className="flex gap-1.5 mt-3">
          {[0,1,2,3,4].map((i) => (
            <div key={i} className={`w-2 h-2 rounded-full ${i < attempts ? 'bg-red-500' : 'bg-slate-600'}`} />
          ))}
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 mt-6 px-6 w-full max-w-xs">
        {(status === 'mismatch' || status === 'error') && (
          <button
            onClick={handleRetry}
            className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-sm font-medium text-white transition-colors"
          >
            Try Again
          </button>
        )}
        <button
          onClick={() => { stopCamera(); onCancel(); }}
          className="flex-1 py-2.5 rounded-xl border border-slate-600 hover:bg-slate-800 text-sm text-slate-300 transition-colors"
        >
          {isError ? 'Close' : 'Cancel'}
        </button>
      </div>

      <style>{`
        @keyframes scanBar {
          0%   { top: 12px;  opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 348px; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
