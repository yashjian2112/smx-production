import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/units/[id]/qc-photo
// FormData: { image: File, testItemId: string }
// Uploads photo to blob, optionally runs AI extraction, returns extracted values
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  requireRole(session, 'QC_USER', 'ADMIN', 'PRODUCTION_MANAGER', 'PRODUCTION_EMPLOYEE');

  const { id: unitId } = await params;
  const form = await req.formData();
  const file = form.get('image') as File | null;
  const testItemId = form.get('testItemId') as string | null;

  if (!file || !testItemId) {
    return NextResponse.json({ error: 'image and testItemId required' }, { status: 400 });
  }

  // Fetch test item with params to know what to extract
  const testItem = await prisma.qCTestItem.findUnique({
    where: { id: testItemId },
    include: { params: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!testItem) {
    return NextResponse.json({ error: 'QC test item not found' }, { status: 404 });
  }

  // Upload photo to blob
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const blobPath = `qc/${unitId}/${testItemId}/${Date.now()}.${ext}`;
  let photoUrl = '';
  try {
    const blob = await put(blobPath, file, {
      access: 'private',
      contentType: file.type || 'image/jpeg',
    });
    photoUrl = blob.url;
  } catch (err) {
    console.error('[qc-photo] Blob upload failed:', err);
    return NextResponse.json({ error: 'Photo upload failed' }, { status: 500 });
  }

  // If AI extraction is not enabled, return just the photo URL
  if (!testItem.aiExtract || testItem.params.length === 0) {
    return NextResponse.json({ photoUrl, extractedValues: null });
  }

  // Run AI extraction
  try {
    const raw = Buffer.from(await file.arrayBuffer());
    const optimized = await sharp(raw, { failOn: 'none' })
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    // Build extraction prompt
    const paramList = testItem.params
      .filter(p => !p.isWriteParam) // only extract read params (not written ones)
      .map(p => {
        const parts = [`"${p.name}"`];
        if (p.label) parts.push(`(labeled "${p.label}")`);
        if (p.unit) parts.push(`in ${p.unit}`);
        return parts.join(' ');
      });

    const prompt = `You are analyzing a VESC Tool screenshot for QC testing of a motor controller.

Extract the following parameter values from this image:
${paramList.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Return ONLY valid JSON in this exact format:
{
  "values": {
${testItem.params.filter(p => !p.isWriteParam).map(p => `    "${p.name}": <number or null if not visible>`).join(',\n')}
  },
  "confidence": "high" | "medium" | "low"
}

Rules:
- Extract exact numeric values as shown on screen
- Use null for any value you cannot read clearly
- Do NOT guess or hallucinate values
- Return raw numbers without units`;

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: optimized.toString('base64') },
          },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json({
        photoUrl,
        extractedValues: parsed.values ?? {},
        confidence: parsed.confidence ?? 'low',
      });
    }

    // Couldn't parse AI response — return photo without values
    return NextResponse.json({ photoUrl, extractedValues: null, confidence: null });
  } catch (aiErr) {
    console.error('[qc-photo] AI extraction failed:', aiErr);
    // Don't block — return photo URL, let user enter manually
    return NextResponse.json({ photoUrl, extractedValues: null, confidence: null });
  }
}
