'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * Renders a Code 128 barcode (GS1-128 compatible) using JsBarcode.
 * Used for Final Assembly stage — customer-facing label.
 */
export function Barcode128({
  value,
  width = 2,
  height = 60,
  displayValue = true,
  fontSize = 12,
  background = '#ffffff',
  lineColor = '#000000',
}: {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  background?: string;
  lineColor?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width,
        height,
        displayValue,
        fontSize,
        background,
        lineColor,
        margin: 4,
        fontOptions: 'bold',
      });
    } catch {
      // Invalid barcode value — leave blank
    }
  }, [value, width, height, displayValue, fontSize, background, lineColor]);

  return <svg ref={ref} />;
}
