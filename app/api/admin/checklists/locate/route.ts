import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type MarkerPosition = { x: number; y: number; label: string };
export type ComponentMarkers = {
  name: string;
  positions: MarkerPosition[];
};

/**
 * POST /api/admin/checklists/locate
 *
 * Given a PCB board reference image URL and a list of components with counts,
 * uses Claude Vision to estimate each component's position on the board.
 *
 * Returns normalized coordinates (0–1) relative to image top-left.
 * Coordinates are approximations — the UI lets users drag/correct them.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  requireRole(session, 'ADMIN');

  const { imageUrl, components } = (await req.json()) as {
    imageUrl: string;
    components: { name: string; count: number }[];
  };

  if (!imageUrl || !components?.length) {
    return NextResponse.json({ error: 'imageUrl and components are required' }, { status: 400 });
  }

  // Fetch the private blob image
  let imageBase64: string;
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg';
  try {
    const r = await fetch(imageUrl, {
      headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!r.ok) throw new Error(`Blob fetch ${r.status}`);
    const ct = r.headers.get('content-type') ?? 'image/jpeg';
    mediaType = ct.includes('png') ? 'image/png' : ct.includes('webp') ? 'image/webp' : 'image/jpeg';
    imageBase64 = Buffer.from(await r.arrayBuffer()).toString('base64');
  } catch (e) {
    return NextResponse.json({ error: `Could not fetch board image: ${e}` }, { status: 500 });
  }

  const componentList = components
    .map((c) => `  • ${c.name}: locate exactly ${c.count} instance(s)`)
    .join('\n');

  const prompt = `You are a PCB component localization expert. Analyze this circuit board image and locate each component listed below.

COMPONENTS TO LOCATE:
${componentList}

COORDINATE SYSTEM:
- Return positions as normalized (x, y) where (0,0) = TOP-LEFT corner, (1,1) = BOTTOM-RIGHT corner
- x increases LEFT → RIGHT, y increases TOP → BOTTOM
- Be as precise as possible — estimate component CENTER points
- If you cannot find all instances, return as many as you can see

LABEL FORMAT:
- Label each instance sequentially: Q1, Q2, Q3 for MOSFETs; C1, C2 for capacitors; etc.
- Use the first letter of the component's common abbreviation (MOSFET→Q, Capacitor→C, Resistor→R, Diode→D, IC→U, Inductor→L, Transformer→T, Header→J, etc.)

Return ONLY a valid JSON array — no markdown, no explanation:
[
  {
    "name": "MOSFET IRFB4227",
    "positions": [
      { "x": 0.12, "y": 0.18, "label": "Q1" },
      { "x": 0.88, "y": 0.18, "label": "Q2" }
    ]
  }
]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: 'You are a PCB component localization expert. Return ONLY valid JSON arrays, absolutely no markdown or explanation.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const raw = (message.content[0] as { text: string }).text.trim();
    const jsonStr = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let markers: ComponentMarkers[];
    try {
      markers = JSON.parse(jsonStr);
      if (!Array.isArray(markers)) throw new Error('Not an array');
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON', raw }, { status: 500 });
    }

    // Clamp all coordinates to [0,1]
    markers = markers.map((m) => ({
      ...m,
      positions: m.positions.map((p) => ({
        ...p,
        x: Math.max(0, Math.min(1, p.x)),
        y: Math.max(0, Math.min(1, p.y)),
      })),
    }));

    return NextResponse.json({ markers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI analysis failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
