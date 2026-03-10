// GET  /api/units/[id]/work  — get active submission + history
// POST /api/units/[id]/work  — start work (record start time)
// PUT  /api/units/[id]/work  — submit image + AI analysis
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';
import Anthropic from '@anthropic-ai/sdk';
import { parseZoneIds, zonesToText } from '@/lib/boardZones';
import sharp from 'sharp';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const unit = await prisma.controllerUnit.findUnique({
    where: { id },
    select: { currentStage: true, currentStatus: true },
  });
  if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [active, history] = await Promise.all([
    prisma.stageWorkSubmission.findFirst({
      where: { unitId: id, stage: unit.currentStage, employeeId: session.id, analysisStatus: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.stageWorkSubmission.findMany({
      where: { unitId: id, stage: unit.currentStage },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  return NextResponse.json({ active, history, stage: unit.currentStage });
}

// ── POST: start work ──────────────────────────────────────────────────────────
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const unit = await prisma.controllerUnit.findUnique({
    where: { id },
    select: { currentStage: true, currentStatus: true },
  });
  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });

  // Return existing active submission if any
  const existing = await prisma.stageWorkSubmission.findFirst({
    where: { unitId: id, stage: unit.currentStage, employeeId: session.id, analysisStatus: 'IN_PROGRESS' },
  });
  if (existing) return NextResponse.json(existing);

  // Mark unit IN_PROGRESS if still PENDING
  if (unit.currentStatus === 'PENDING') {
    await prisma.controllerUnit.update({ where: { id }, data: { currentStatus: 'IN_PROGRESS' } });
    await prisma.stageLog.create({
      data: { unitId: id, userId: session.id, stage: unit.currentStage, statusFrom: 'PENDING', statusTo: 'IN_PROGRESS' },
    });
  }

  const submission = await prisma.stageWorkSubmission.create({
    data: { unitId: id, employeeId: session.id, stage: unit.currentStage },
  });

  return NextResponse.json(submission, { status: 201 });
}

// ── PUT: submit image + AI analysis ──────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get('image') as File | null;
  const submissionId = formData.get('submissionId') as string | null;

  if (!file) return NextResponse.json({ error: 'Image required' }, { status: 400 });

  const unit = await prisma.controllerUnit.findUnique({
    where: { id },
    include: { product: true },
  });
  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });

  // Find submission to update
  const submission = submissionId
    ? await prisma.stageWorkSubmission.findUnique({ where: { id: submissionId } })
    : await prisma.stageWorkSubmission.findFirst({
        where: { unitId: id, stage: unit.currentStage, employeeId: session.id, analysisStatus: 'IN_PROGRESS' },
        orderBy: { startedAt: 'desc' },
      });

  if (!submission) return NextResponse.json({ error: 'No active work submission found' }, { status: 404 });

  // Upload to Vercel Blob
  const blob = await put(`stage-work/${id}/${unit.currentStage}/${Date.now()}.jpg`, file, {
    access: 'private',
    contentType: file.type || 'image/jpeg',
  });

  // Mark as ANALYZING
  await prisma.stageWorkSubmission.update({
    where: { id: submission.id },
    data: { imageUrl: blob.url, analysisStatus: 'ANALYZING', submittedAt: new Date() },
  });

  // Fetch checklist items for this stage: product-specific + global (null productId)
  // Product-specific items take precedence (sorted first by having a productId)
  const checklistRaw = await prisma.stageChecklistItem.findMany({
    where: {
      stage: unit.currentStage,
      active: true,
      OR: [
        { productId: unit.productId },  // specific to this unit's product model
        { productId: null },             // global items (apply to all models)
      ],
    },
    orderBy: [{ sortOrder: 'asc' }],
  });
  // If both a product-specific AND a global item share the same name, prefer the product-specific one
  const seenNames = new Set<string>();
  const checklist = [
    ...checklistRaw.filter(c => c.productId !== null),
    ...checklistRaw.filter(c => c.productId === null),
  ].filter(c => {
    if (seenNames.has(c.name)) return false;
    seenNames.add(c.name);
    return true;
  });

  // Separate board reference item from component items
  const boardRefItem    = checklist.find(c => c.isBoardReference);
  const componentItems  = checklist.filter(c => !c.isBoardReference);

  // ── Claude Vision ────────────────────────────────────────────────────────────
  let analysisResult: 'PASS' | 'FAIL' = 'PASS';
  let analysisIssues: { name: string; status: string; note: string; location?: string }[] = [];
  let analysisSummary = 'Analysis complete.';

  try {
    // ── Build structured COMPONENT MANIFEST ──────────────────────────────────
    // This is the key accuracy improvement: give Claude exact counts,
    // orientation rules, and location info per component type.
    const manifest = componentItems.length > 0
      ? componentItems
          .map((c, i) => {
            const parts: string[] = [];
            parts.push(`${i + 1}. ${c.name}`);
            if (c.expectedCount)   parts.push(`  Expected count  : ${c.expectedCount}`);
            if (c.boardLocation) {
              // Convert zone IDs to readable text; fall back to raw value for legacy entries
              const zoneIds  = parseZoneIds(c.boardLocation);
              const readable = zoneIds.length > 0 ? zonesToText(zoneIds) : c.boardLocation;
              parts.push(`  Board location  : ${readable}`);
            }
            if (c.orientationRule) parts.push(`  Orientation rule: ${c.orientationRule}`);
            if (c.description)     parts.push(`  Additional notes: ${c.description}`);
            // Include pick-&-place coordinates so Claude knows exactly where to look
            if (c.componentPositions) {
              try {
                const positions: Array<{ x: number; y: number; label: string; size?: string }> =
                  JSON.parse(c.componentPositions as string);
                if (positions.length > 0) {
                  const coordHints = positions
                    .map(p => `${p.label}@(${Math.round(p.x * 100)}%,${Math.round(p.y * 100)}%)`)
                    .join('  ');
                  parts.push(`  Precise positions: ${coordHints}  ← x% from left, y% from top`);
                }
              } catch { /* invalid JSON, skip */ }
            }
            parts.push(`  Required        : ${c.required ? 'YES — board FAILS if any issue found' : 'NO'}`);
            return parts.join('\n');
          })
          .join('\n\n')
      : 'No specific component manifest defined — verify overall build quality.';

    // Total expected parts for count validation
    const totalExpected = componentItems.reduce((sum, c) => sum + (c.expectedCount ?? 1), 0);
    const countSummary  = componentItems.length > 0
      ? `\nTotal parts expected on this board: ${totalExpected}`
      : '';

    // ── Fetch employee's captured image ───────────────────────────────────────
    // Private Vercel Blob requires Authorization header for server-side fetches
    const blobAuth = { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` };
    const imgRes    = await fetch(blob.url, { headers: blobAuth });
    const imgBuffer = await imgRes.arrayBuffer();
    const imgBuf    = Buffer.from(imgBuffer);          // reuse buffer for crops
    const base64    = imgBuf.toString('base64');
    const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';

    // Get pixel dimensions — needed to convert normalized (0–1) positions to pixel coords
    const imgMeta = await sharp(imgBuf).metadata();
    const imgW    = imgMeta.width  ?? 1000;
    const imgH    = imgMeta.height ?? 1000;

    // ── Fetch reference images ────────────────────────────────────────────────
    type ImageBlock = {
      type: 'image';
      source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string };
    };
    type TextBlock = { type: 'text'; text: string };
    const contentBlocks: (ImageBlock | TextBlock)[] = [];

    // Board-level reference image (most important — full correct board)
    if (boardRefItem?.referenceImageUrl) {
      try {
        const refRes = await fetch(boardRefItem.referenceImageUrl, { headers: blobAuth });
        if (refRes.ok) {
          const refBuf     = await refRes.arrayBuffer();
          const refType    = (refRes.headers.get('content-type') || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
          contentBlocks.push({ type: 'text', text: '══ BOARD REFERENCE IMAGE (correct completed board — use this as the gold standard) ══' });
          contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: refType, data: Buffer.from(refBuf).toString('base64') } });
        }
      } catch { /* skip silently */ }
    }

    // Per-component reference images (close-up reference photos)
    const compRefImages: { name: string; base64: string; mediaType: string }[] = [];
    for (const item of componentItems) {
      if (!item.referenceImageUrl) continue;
      try {
        const refRes = await fetch(item.referenceImageUrl, { headers: blobAuth });
        if (!refRes.ok) continue;
        const refBuf     = await refRes.arrayBuffer();
        const contentType = refRes.headers.get('content-type') || 'image/jpeg';
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType)) continue;
        compRefImages.push({ name: item.name, base64: Buffer.from(refBuf).toString('base64'), mediaType: contentType });
      } catch { /* skip */ }
    }

    if (compRefImages.length > 0) {
      contentBlocks.push({ type: 'text', text: `══ COMPONENT REFERENCE IMAGES (${compRefImages.length} close-up samples) ══` });
      for (const ref of compRefImages) {
        contentBlocks.push({ type: 'text', text: `Component reference: ${ref.name}` });
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: ref.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: ref.base64 },
        });
      }
    }

    // Employee's submitted photo — always last
    contentBlocks.push({ type: 'text', text: '══ SUBMITTED PHOTO (inspect this — compare against reference images above) ══' });
    contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });

    // ── Region crops for small-footprint components ───────────────────────────
    // Components marked micro/mini/small are often invisible at full-board scale.
    // Crop their pick-&-place regions from the submitted photo and send as
    // close-ups so Claude can inspect exact pad locations clearly.
    type MarkerPos = { x: number; y: number; label: string; size?: string };
    const SMALL_SIZES = new Set(['micro', 'mini', 'small']);
    const CROP_PAD    = 0.06; // 6% padding around bounding box
    const MAX_CROPS   = 8;
    let   totalCrops  = 0;

    const smallItems = componentItems.filter(item => {
      if (!item.componentPositions) return false;
      try {
        const pos: MarkerPos[] = JSON.parse(item.componentPositions as string);
        return pos.some(p => SMALL_SIZES.has(p.size ?? 'small'));
      } catch { return false; }
    });

    if (smallItems.length > 0) {
      contentBlocks.push({
        type: 'text',
        text: `══ CLOSE-UP CROPS FROM SUBMITTED PHOTO (${smallItems.length} small-component group${smallItems.length > 1 ? 's' : ''}) ══\nExamine each crop carefully — the markers show EXACTLY where each component should be seated.`,
      });

      for (const item of smallItems) {
        if (totalCrops >= MAX_CROPS) break;

        let positions: MarkerPos[];
        try { positions = JSON.parse(item.componentPositions as string); }
        catch { continue; }

        const smallPos = positions.filter(p => SMALL_SIZES.has(p.size ?? 'small'));
        if (smallPos.length === 0) continue;

        // If markers span > 50% of width, split into left and right clusters
        const xs    = smallPos.map(p => p.x);
        const spanX = Math.max(...xs) - Math.min(...xs);
        const regions: { label: string; positions: MarkerPos[] }[] =
          spanX > 0.5 && smallPos.length >= 2
            ? (() => {
                const midX     = (Math.min(...xs) + Math.max(...xs)) / 2;
                const leftPos  = smallPos.filter(p => p.x <= midX);
                const rightPos = smallPos.filter(p => p.x > midX);
                const out: { label: string; positions: MarkerPos[] }[] = [];
                if (leftPos.length)  out.push({ label: `${item.name} — left side`,  positions: leftPos });
                if (rightPos.length) out.push({ label: `${item.name} — right side`, positions: rightPos });
                return out;
              })()
            : [{ label: item.name, positions: smallPos }];

        for (const region of regions) {
          if (totalCrops >= MAX_CROPS) break;

          const rxs    = region.positions.map(p => p.x);
          const rys    = region.positions.map(p => p.y);
          const left   = Math.max(0,    Math.round((Math.min(...rxs) - CROP_PAD) * imgW));
          const top    = Math.max(0,    Math.round((Math.min(...rys) - CROP_PAD) * imgH));
          const right  = Math.min(imgW, Math.round((Math.max(...rxs) + CROP_PAD) * imgW));
          const bottom = Math.min(imgH, Math.round((Math.max(...rys) + CROP_PAD) * imgH));
          const width  = Math.max(80, right - left);
          const height = Math.max(80, bottom - top);

          try {
            const cropBuf = await sharp(imgBuf)
              .extract({ left, top, width: Math.min(width, imgW - left), height: Math.min(height, imgH - top) })
              .jpeg({ quality: 92 })
              .toBuffer();

            const markerList = region.positions.map(p => p.label).join(', ');
            contentBlocks.push({
              type: 'text',
              text: `Close-up crop: ${region.label} — expected marker${region.positions.length > 1 ? 's' : ''} ${markerList}`,
            });
            contentBlocks.push({
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: cropBuf.toString('base64') },
            });
            totalCrops++;
          } catch (cropErr) {
            console.error('[crops] Failed for', region.label, cropErr);
          }
        }
      }
    }

    // ── Main inspection prompt ────────────────────────────────────────────────
    contentBlocks.push({
      type: 'text',
      text: `You are a precision PCB quality-control AI for SMX Drives electronic controller manufacturing.
Your job: inspect the SUBMITTED PHOTO and verify every component against the COMPONENT MANIFEST below.
${boardRefItem?.referenceImageUrl ? 'A board reference image (correct completed board) has been provided — use it as the primary visual comparison.' : ''}

Stage   : ${unit.currentStage.replace(/_/g, ' ')}
Serial  : ${unit.serialNumber}
Product : ${unit.product?.name ?? 'Unknown'}

══ COMPONENT MANIFEST ══
${manifest}
${countSummary}

For EACH component in the manifest, verify ALL of the following:
1. COUNT       — Are ALL expected units present? (count them individually)
2. LOCATION    — Are they in the correct board zone as specified in "Board location"?
3. ORIENTATION — Does every unit follow the orientation rule exactly?
4. ALIGNMENT   — Are they seated correctly on pads, not shifted/tilted/tombstoned?
5. DAMAGE      — Any cracked, burned, or visibly defective units?

Respond ONLY with valid JSON — no markdown fences, no extra text:
{
  "overall": "PASS" or "FAIL",
  "components": [
    {
      "name": "component name from manifest (include count found, e.g. 'MOSFET (found 17 of 18)')",
      "status": "PRESENT" | "MISSING" | "DEFECTIVE" | "WRONG_ORIENTATION" | "SOLDER_ISSUE" | "MISPLACED",
      "note": "specific finding — include count if mismatch, exact location of problem, orientation issue detail",
      "location": "board position, e.g. 'top-left group, 3rd unit' or 'bottom-center strip'"
    }
  ],
  "summary": "1–2 sentences: overall assessment with counts verified and any issues found"
}

STRICT RULES:
— Count every visible unit individually — do not guess.
— If expected count is 18 and you can only see 17, status = MISSING with note explaining which position is empty.
— If a component is found in the WRONG ZONE (not matching board location), status = MISPLACED.
— If orientation rule is given and ANY unit violates it, status = WRONG_ORIENTATION — this is an immediate FAIL.
— PASS only when: all REQUIRED components are present with correct count, correct location, correct orientation, and correct alignment.
— If the image is blurry, too dark, or board not visible: overall = FAIL, explain in summary.
— Compare against the board reference image for position, zone, and orientation verification.
— For components with "Precise positions" listed: cross-reference those exact coordinates on the submitted photo.
— For components with close-up crops provided: examine the crop carefully — empty pads = MISSING, component on pads = PRESENT.`,
    });

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: contentBlocks }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    const match   = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed        = JSON.parse(match[0]);
      analysisResult      = parsed.overall === 'PASS' ? 'PASS' : 'FAIL';
      analysisIssues      = parsed.components ?? [];
      analysisSummary     = parsed.summary ?? '';
    }
  } catch (err) {
    console.error('Vision error:', err);
    analysisSummary = 'AI analysis unavailable — image saved, manual review required.';
  }

  const now          = new Date();
  const buildTimeSec = Math.round((now.getTime() - new Date(submission.startedAt).getTime()) / 1000);

  const updated = await prisma.stageWorkSubmission.update({
    where: { id: submission.id },
    data: {
      analysisStatus:  analysisResult === 'PASS' ? 'PASSED' : 'FAILED',
      analysisResult,
      analysisIssues:  JSON.stringify(analysisIssues),
      analysisSummary,
      completedAt:     analysisResult === 'PASS' ? now : undefined,
      buildTimeSec:    analysisResult === 'PASS' ? buildTimeSec : undefined,
    },
  });

  // On PASS → auto-complete the unit stage
  if (analysisResult === 'PASS') {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/units/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') ?? '' },
        body: JSON.stringify({ status: 'COMPLETED', userId: session.id }),
      });
    } catch (e) {
      console.error('Auto-complete failed:', e);
    }
  }

  return NextResponse.json({ submission: updated, result: analysisResult, issues: analysisIssues, summary: analysisSummary });
}
