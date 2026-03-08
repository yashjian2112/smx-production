'use client';

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export function QRCodeCanvas({
  value,
  size = 100,
  dark = '#ffffff',
  light = 'transparent',
}: {
  value: string;
  size?: number;
  dark?: string;
  light?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (ref.current && value) {
      QRCode.toCanvas(ref.current, value, {
        width: size,
        margin: 1,
        color: { dark, light },
      }).catch(console.error);
    }
  }, [value, size, dark, light]);

  return <canvas ref={ref} width={size} height={size} style={{ borderRadius: 4 }} />;
}
