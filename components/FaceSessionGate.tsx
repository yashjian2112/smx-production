'use client';

import { useState, useEffect } from 'react';
import { FaceGate } from './FaceGate';

const STORAGE_KEY = 'smx_face_verified';
const STORAGE_USER_KEY = 'smx_face_verified_user';
const STORAGE_EXPIRY_KEY = 'smx_face_verified_expiry';
const EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours

type GateState = 'checking' | 'not_enrolled' | 'needs_verify' | 'verified';

function isVerifiedInStorage(userId: string): boolean {
  try {
    const verified = localStorage.getItem(STORAGE_KEY);
    const storedUser = localStorage.getItem(STORAGE_USER_KEY);
    const expiry = localStorage.getItem(STORAGE_EXPIRY_KEY);
    if (verified !== '1' || storedUser !== userId) return false;
    if (!expiry || Date.now() > parseInt(expiry, 10)) return false;
    return true;
  } catch {
    return false;
  }
}

function saveVerifiedToStorage(userId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
    localStorage.setItem(STORAGE_USER_KEY, userId);
    localStorage.setItem(STORAGE_EXPIRY_KEY, String(Date.now() + EXPIRY_MS));
  } catch { /* ignore */ }
}

function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_EXPIRY_KEY);
  } catch { /* ignore */ }
}

export function FaceSessionGate({ children, userId }: { children: React.ReactNode; userId: string }) {
  const [state, setState] = useState('checking' as GateState);

  useEffect(() => {
    // Already verified within the last 8 hours for this user — skip entirely
    if (isVerifiedInStorage(userId)) {
      setState('verified');
      return;
    }
    // Different user or expired — clear stale data
    clearStorage();
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
    saveVerifiedToStorage(userId);
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
