// POST /api/check-pcb
// Lightweight, fast endpoint: checks if the submitted image shows a PCB.
// Used by the client BEFORE confirming each zone photo — gives instant feedback
// so workers don't upload 3 photos only to be told it's not a board.
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (!file) return NextResponse.json({ error: 'Image required' }, { status: 400 });

    // Downscale to 512px for a fast, cheap check (only needs to identify shape)
    const raw = Buffer.from(await file.arrayBuffer());
    const thumb = await sharp(raw, { failOn: 'none' })
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', // fastest + cheapest model
      max_tokens: 64,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: thumb.toString('base64') },
          },
          {
            type: 'text',
            text: 'Is any printed circuit board (PCB) or electronic circuit board visible anywhere in this image? PCBs come in many colours: green, blue, white, silver, aluminium/metal substrate, yellow, or black. They have electronic components mounted on them (chips, MOSFETs, capacitors, resistors, connectors, solder pads, traces). Even if the board is small or surrounded by background, answer YES if a PCB is anywhere in the frame. Answer only with valid JSON: {"isPcb": true} or {"isPcb": false}. No other text.',
          },
        ],
      }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return NextResponse.json({ isPcb: !!parsed.isPcb });
    }

    // If Claude response is unparseable, allow it through (don't block workers)
    return NextResponse.json({ isPcb: true });
  } catch (err) {
    // On error, allow through — don't block workers due to API issues
    console.error('[check-pcb]', err);
    return NextResponse.json({ isPcb: true });
  }
}
