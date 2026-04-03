'use client';

import { useEffect } from 'react';

/**
 * Global fix: prevent scroll-wheel from changing number input values.
 * Mount once in the root layout.
 */
export default function NumberInputScrollFix() {
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      const el = document.activeElement as HTMLInputElement | null;
      if (el?.type === 'number') {
        el.blur();
      }
    }
    document.addEventListener('wheel', handleWheel, { passive: true });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  return null;
}
