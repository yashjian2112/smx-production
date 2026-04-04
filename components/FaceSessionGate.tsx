'use client';

import { useState, useEffect } from 'react';
import { FaceGate } from './FaceGate';

type GateState = 'checking' | 'not_enrolled' | 'needs_verify' | 'verified';

export function FaceSessionGate({
  children,
  userId,
  serverVerified,
}: {
  children: React.ReactNode;
  userId: string;
  serverVerified: boolean;
}) {
  // If the server already confirmed this user's face cookie, start as verified
  const [state, setState] = useState(serverVerified ? ('verified' as GateState) : ('checking' as GateState));

  useEffect(() => {
    // Server already verified via cookie — nothing to do
    if (serverVerified) return;

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
        // Network error — require verification to be safe (retry on refresh)
        setState('needs_verify');
      });
  }, [userId, serverVerified]);

  function handleVerified() {
    // FaceGate already called the server and the cookie is set — just update UI state
    setState('verified');
  }

  // Always render children — FaceGate overlays on top when needed.
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
          onCancel={() => { setState('not_enrolled'); }}
        />
      )}
    </>
  );
}
