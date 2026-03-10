import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type ScannedComponent = {
  presetId: string;      // matches COMPONENT_PRESETS id
  name: string;          // e.g. "MOSFET IRFB4227"
  expectedCount: number;
  boardLocation: string; // zone ids e.g. "TL,TR"
  orientationRule: string;
  description: string;
  required: boolean;
};

/**
 * POST /api/admin/checklists/scan
 * Body: { imageUrl: string }
 *
 * Sends the board reference image to Claude Vision and returns
 * an auto-detected component list for the checklist.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER');

  const { imageUrl } = await req.json();
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });

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

  const systemPrompt = `You are an expert PCB component inspector. You analyze circuit board images and identify electronic components.
Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

  const userPrompt = `Analyze this PCB board image and identify every distinct component type visible on it.

For each component type return a JSON object. Return an array of such objects.

Rules:
- Group identical components by type (e.g. all MOSFETs together, all resistors together)
- Count as accurately as possible from the image
- For boardLocation use zone codes: TL (top-left), TC (top-center), TR (top-right), ML (middle-left), MC (middle-center), MR (middle-right), BL (bottom-left), BC (bottom-center), BR (bottom-right) — pick all zones where this component appears, comma-separated
- For presetId use ONLY one of: mosfet, resistor, smd-cap, elec-cap, diode, ic, header, bus-bar, inductor, transformer, spacer, custom
- If unsure of exact count, give your best estimate
- Only include components clearly visible on the board

Return this exact JSON structure (array, no wrapper):
[
  {
    "presetId": "mosfet",
    "name": "MOSFET",
    "expectedCount": 18,
    "boardLocation": "TL,TR,BL,BR",
    "orientationRule": "Heatsink tab must face outward from board centre",
    "description": "Power switching MOSFETs arranged in H-bridge configuration",
    "required": true
  }
]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          { type: 'text', text: userPrompt },
        ],
      }],
    });

    const raw = (message.content[0] as { text: string }).text.trim();
    // Strip any accidental markdown fences
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let components: ScannedComponent[];
    try {
      components = JSON.parse(jsonStr);
      if (!Array.isArray(components)) throw new Error('Not an array');
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON', raw }, { status: 500 });
    }

    return NextResponse.json({ components });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI analysis failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
