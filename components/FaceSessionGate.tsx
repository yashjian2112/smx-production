'use client';

import { useState, useEffect } from 'react';
import { FaceGate } from './FaceGate';

const SESSION_KEY = 'smx_face_verified';
const SESSION_USER_KEY = 'smx_face_verified_user';

type GateState = 'checking' | 'not_enrolled' | 'needs_verify' | 'verified';

export function FaceSessionGate({ children, userId }: { children: React.ReactNode; userId: string }) {
  const [state, setState] = useState('checking' as GateState);

  useEffect(() => {
    // Already verified this session for this specific user — skip API call
    if (
      sessionStorage.getItem(SESSION_KEY) === '1' &&
      sessionStorage.getItem(SESSION_USER_KEY) === userId
    ) {
      setState('verified');
      return;
    }
    // Different user or no verification — clear stale keys
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
    // Check if this user has a face enrolled
    fetch('/api/me/face-descriptor')
      .then((r) => {
        if (r.status === 404 || r.status === 401) return null;
        return r.json();
      })
      .then((data) => {
        if (!data || !data.enrolled) {
          setState('not_enrolled');
        } else {
          setState('needs_verify');
        }
      })
      .catch(() => {
        // Network error — let through
        setState('not_enrolled');
      });
  }, [userId]);

  function handleVerified() {
    sessionStorage.setItem(SESSION_KEY, '1');
    sessionStorage.setItem(SESSION_USER_KEY, userId);
    setState('verified');
  }

  // Always render children — FaceGate overlays on top (fixed inset-0) when needed.
  // This eliminates the black-screen flash during the 'checking' phase.
  return (
    <>
      {state === 'not_enrolled' && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-600 text-white text-xs text-center py-1.5 px-4">
          Face not enrolled — go to <strong>Admin → Users</strong> to enroll your face for secure access.
        </div>
      )}
      {children}
      {state === 'needs_verify' && (
        <FaceGate
          mode="verify"
          title="Verify your identity to continue"
          onVerified={handleVerified}
          onCancel={() => { window.location.href = '/login'; }}
        />
      )}
    </>
  );
}
