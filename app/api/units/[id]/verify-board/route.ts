import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// POST /api/units/[id]/verify-board
// Receives back photo (barcode side) and front photo (component side)
// Validates:
//   1. Back photo contains the expected barcode
//   2. Front photo matches the reference image for this product+stage
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const unit = await prisma.controllerUnit.findUnique({
      where: { id },
      select: {
        id: true,
        currentStage: true,
        powerstageBarcode: true,
        brainboardBarcode: true,
        product: { select: { id: true, name: true } },
      },
    });
    if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });

    // Determine expected barcode for current stage
    const expectedBarcode = unit.currentStage === 'POWERSTAGE_MANUFACTURING'
      ? unit.powerstageBarcode
      : unit.currentStage === 'BRAINBOARD_MANUFACTURING'
      ? unit.brainboardBarcode
      : null;

    const form = await req.formData();
    const backPhoto = form.get('backPhoto') as File | null;
    const frontPhoto = form.get('frontPhoto') as File | null;

    if (!backPhoto || !frontPhoto) {
      return NextResponse.json({ error: 'Both photos are required' }, { status: 400 });
    }

    // Upload both photos for audit trail
    const [backBlob, frontBlob] = await Promise.all([
      put(`board-verify/${id}/${Date.now()}-back.jpg`, backPhoto, { access: 'public', contentType: 'image/jpeg' }),
      put(`board-verify/${id}/${Date.now()}-front.jpg`, frontPhoto, { access: 'public', contentType: 'image/jpeg' }),
    ]);

    // Get reference image for this stage
    const reference = await prisma.stageReference.findUnique({
      where: { productId_stage: { productId: unit.product.id, stage: unit.currentStage as never } },
    });

    // Convert photos to base64 for Claude Vision
    const backBytes = await backPhoto.arrayBuffer();
    const frontBytes = await frontPhoto.arrayBuffer();
    const backBase64 = Buffer.from(backBytes).toString('base64');
    const frontBase64 = Buffer.from(frontBytes).toString('base64');

    // Build Claude Vision prompt
    const imageContent: Anthropic.ImageBlockParam[] = [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: backBase64 } },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frontBase64 } },
    ];

    // If reference image exists, fetch and include it
    let refInstruction = '';
    let hasRef = false;
    if (reference?.imageUrl) {
      try {
        const refRes = await fetch(reference.imageUrl);
        const refBuf = await refRes.arrayBuffer();
        const refBase64 = Buffer.from(refBuf).toString('base64');
        imageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: refBase64 } });
        hasRef = true;
        refInstruction = [
          'Image 3 is the REFERENCE photo of what the correct front side should look like.',
          'Compare Image 2 (front photo) against Image 3 (reference):',
          '- Does it appear to be the same type/model of PCB board?',
          '- Is the component layout broadly similar?',
          '- Note: minor angle/lighting differences are OK. We are checking same model, not identical pixel match.',
          'Set "frontMatchesReference" to true if clearly same board model, false if completely different board.',
        ].join('\n');
      } catch { /* ignore ref fetch failure */ }
    }

    const barcodeStr = expectedBarcode ?? 'unknown';
    const promptLines = [
      'You are a manufacturing verification assistant. Analyze these PCB board photos.',
      '',
      'Image 1 is the BACK side of a PCB board (should show a barcode label).',
      'Image 2 is the FRONT side (component side) of the same board.',
      refInstruction,
      '',
      'Expected barcode on this board: "' + barcodeStr + '"',
      '',
      'Tasks:',
      '1. Check Image 1 (back photo): Can you read any barcode text/numbers? Does it match or contain "' + barcodeStr + '"?',
      '   - Barcodes may be partially visible, at an angle, or have surrounding text',
      '   - If you can read ANY text that matches the expected barcode, mark as matching',
      '   - Set "barcodeReadable" to true if you can read text, false if photo is too blurry/no barcode visible',
      '   - Set "barcodeMatches" to true if the readable text matches the expected barcode',
      '2. Check Image 2 (front photo): Does it show a real PCB/circuit board?',
      '   - Set "isPCB" to true if it clearly shows electronic components on a board',
      hasRef ? '3. Compare front photo against reference (Image 3) as described above.' : '',
      '',
      'Return ONLY valid JSON (no markdown):',
      '{',
      '  "barcodeReadable": boolean,',
      '  "barcodeText": "text you read from barcode or null",',
      '  "barcodeMatches": boolean,',
      '  "isPCB": boolean,',
      '  "frontMatchesReference": ' + (hasRef ? 'boolean' : 'true') + ',',
      '  "notes": "brief explanation"',
      '}',
    ];
    const prompt = promptLines.join('\n');

    let verifyResult = { barcodeReadable: false, barcodeText: null as string | null, barcodeMatches: false, isPCB: true, frontMatchesReference: true, notes: '' };

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            ...imageContent,
            { type: 'text', text: prompt },
          ],
        }],
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        verifyResult = { ...verifyResult, ...JSON.parse(jsonMatch[0]) };
      }
    } catch (aiErr) {
      console.error('AI verification failed:', aiErr);
      // On AI failure, allow through with warning
      return NextResponse.json({
        verified: true,
        warning: 'AI verification unavailable — photos saved for manual review',
        backPhotoUrl: backBlob.url,
        frontPhotoUrl: frontBlob.url,
      });
    }

    // Determine pass/fail
    const barcodeOk = !expectedBarcode || verifyResult.barcodeMatches || !verifyResult.barcodeReadable;
    const frontOk = verifyResult.isPCB && verifyResult.frontMatchesReference;
    const verified = barcodeOk && frontOk;

    // Build failure reasons
    const reasons: string[] = [];
    if (expectedBarcode && verifyResult.barcodeReadable && !verifyResult.barcodeMatches) {
      reasons.push(`Barcode mismatch: expected "${expectedBarcode}", read "${verifyResult.barcodeText}"`);
    }
    if (!verifyResult.isPCB) {
      reasons.push('Front photo does not show a PCB board');
    }
    if (!verifyResult.frontMatchesReference && reference?.imageUrl) {
      reasons.push('Board does not match the reference image for this product');
    }

    return NextResponse.json({
      verified,
      barcodeReadable: verifyResult.barcodeReadable,
      barcodeMatches: verifyResult.barcodeMatches,
      barcodeText: verifyResult.barcodeText,
      isPCB: verifyResult.isPCB,
      frontMatchesReference: verifyResult.frontMatchesReference,
      reasons,
      notes: verifyResult.notes,
      backPhotoUrl: backBlob.url,
      frontPhotoUrl: frontBlob.url,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Board verification error:', e);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
