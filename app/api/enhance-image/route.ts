import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import sharp from 'sharp';

// Must run on Node.js runtime — sharp uses native binaries
export const runtime = 'nodejs';

/**
 * POST /api/enhance-image
 * Body: FormData with "image" file
 *
 * Applies server-side pixel enhancement:
 *   1. CLAHE  — local contrast equalisation (reveals hidden detail in dark areas)
 *   2. Sharpen — Gaussian unsharp mask (removes camera/motion blur at pixel level)
 *   3. Modulate — slight saturation boost (makes colour-coded markings pop)
 *
 * Returns: enhanced JPEG as binary response
 */
export async function POST(req: NextRequest) {
  try {
    await requireSession();

    const form = await req.formData();
    const file = form.get('image') as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());

    const enhanced = await sharp(buf)
      // ── Step 1: CLAHE — adaptive local contrast enhancement ──────────────
      // Divides image into 32×32 tiles and equalises each independently.
      // Reveals component markings hidden in shadows/highlights.
      // maxSlope=3 prevents over-amplifying noise in flat areas.
      .clahe({ width: 32, height: 32, maxSlope: 3 })

      // ── Step 2: Unsharp mask — removes camera and motion blur ─────────────
      // sigma=1.5 → blur radius (how wide each edge halo is)
      // m1=0.5    → flat area threshold (don't sharpen noise in smooth regions)
      // m2=2.5    → jagged area strength (aggressively sharpen hard edges/text)
      // x1=2      → transition point between flat and jagged
      .sharpen({ sigma: 1.5, m1: 0.5, m2: 2.5, x1: 2, y2: 10, y3: 20 })

      // ── Step 3: Colour modulation ─────────────────────────────────────────
      // Slight saturation boost makes colour-coded component markings
      // (resistor bands, IC body colours) easier to distinguish
      .modulate({ saturation: 1.15 })

      // ── Output: high-quality progressive JPEG ─────────────────────────────
      .jpeg({ quality: 92, progressive: true, mozjpeg: true })
      .toBuffer();

    return new NextResponse(enhanced.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type':  'image/jpeg',
        'Cache-Control': 'no-store',
        'X-Enhanced':    'clahe+sharpen+modulate',
      },
    });
  } catch (err) {
    console.error('enhance-image error:', err);
    const msg = err instanceof Error ? err.message : 'Enhancement failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
