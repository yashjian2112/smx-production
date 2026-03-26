import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';
import type { ScannedComponent } from '@/app/api/admin/checklists/scan/route';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/admin/checklists/pick
 * Body: { imageUrl: string, x: number, y: number }
 *
 * User clicked at normalized position (x, y) on the board image.
 * Claude Vision identifies the single component at that location.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  requireRole(session, 'ADMIN');

  const { imageUrl, x, y } = await req.json();
  if (!imageUrl || x == null || y == null) {
    return NextResponse.json({ error: 'imageUrl, x, and y are required' }, { status: 400 });
  }

  // Fetch the private blob image
  let imageBase64: string;
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  try {
    const r = await fetch(imageUrl, {
      headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!r.ok) throw new Error(`Blob fetch failed: ${r.status}`);
    const buf = await r.arrayBuffer();
    imageBase64 = Buffer.from(buf).toString('base64');
    const ct = r.headers.get('content-type') ?? 'image/jpeg';
    mediaType = ct.includes('png') ? 'image/png' : ct.includes('webp') ? 'image/webp' : 'image/jpeg';
  } catch (err) {
    return NextResponse.json({ error: `Could not fetch board image: ${err}` }, { status: 500 });
  }

  const xPct = Math.round(x * 100);
  const yPct = Math.round(y * 100);

  const prompt = `You are an expert PCB electronics engineer performing precise component identification.

A user clicked at position (${xPct}% from left, ${yPct}% from top) on this PCB board image.

Identify the SINGLE electronic component located at or nearest to that position.

COMPONENT TYPE GUIDE — use these to choose the correct presetId:
- mosfet: power transistor with flat metal tab/heatsink surface, usually in TO-220/D2PAK package
- resistor: small rectangular SMD chip or through-hole component with coloured bands
- smd-cap: small rectangular SMD ceramic capacitor (looks like SMD resistor but no markings)
- elec-cap: cylindrical electrolytic capacitor with polarity marking (+/-)
- diode: small 2-pin component, often with a stripe marking, or large power diode
- ic: flat multi-pin integrated circuit chip (QFP, SOIC, DIP packages)
- header: plastic connector housing with rows of metal pins (JST, Molex, etc.)
- bus-bar: THICK flat copper or aluminium bar/strip used for high-current power distribution — NOT a header
- inductor: coil/toroid, often drum-shaped or rectangular with wire windings visible
- transformer: larger magnetic core component with multiple windings
- spacer: mechanical standoff or spacer, no electrical function
- custom: anything that does not fit above categories

KEY DISTINCTIONS:
- bus-bar vs header: A bus-bar is a solid metal conductor (copper/aluminium strip), thick and flat. A header has a plastic body with individual metal pins. If you see a thick copper strip, choose bus-bar.
- smd-cap vs resistor: Resistors often have printed values; ceramic caps usually have none.

Return ONLY a single valid JSON object — no markdown, no explanation, no code fences:
{
  "presetId": "mosfet",
  "name": "MOSFET IRFB4227",
  "expectedCount": 1,
  "boardLocation": "TL",
  "orientationRule": "Heatsink tab must face outward from board centre",
  "description": "Power switching MOSFET",
  "required": true
}

- boardLocation: zone code — TL, TC, TR, ML, MC, MR, BL, BC, BR
- expectedCount: always 1
- name: be specific (include part number if visible, e.g. "MOSFET IRFB4227" not just "MOSFET")`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const raw = (message.content[0] as { text: string }).text.trim();
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let component: ScannedComponent;
    try {
      component = JSON.parse(jsonStr);
      if (typeof component !== 'object' || Array.isArray(component)) throw new Error('Not an object');
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON', raw }, { status: 500 });
    }

    return NextResponse.json({ component });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI analysis failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
