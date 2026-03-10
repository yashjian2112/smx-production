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

  // Determine which photo zones are needed for this stage + product
  // (so the worker UI knows how many photos to request)
  const unitFull = await prisma.controllerUnit.findUnique({
    where: { id },
    select: { currentStage: true, productId: true },
  });
  let requiredZones: string[] = ['full']; // always need the full-board photo
  if (unitFull) {
    const zoneItems = await prisma.stageChecklistItem.findMany({
      where: {
        stage: unitFull.currentStage,
        active: true,
        isBoardReference: false,
        photoZone: { not: null },
        OR: [{ productId: unitFull.productId }, { productId: null }],
      },
      select: { photoZone: true },
    });
    const zonesRaw   = zoneItems.map(z => z.photoZone).filter((z): z is string => !!z);
    const extraZones = Array.from(new Set(zonesRaw));
    requiredZones = ['full', ...extraZones.filter(z => z !== 'full')];
  }

  return NextResponse.json({ active, history, stage: unit.currentStage, requiredZones });
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
  const file      = formData.get('image')        as File | null;
  const fileTop   = formData.get('image_top')    as File | null;
  const fileBottom = formData.get('image_bottom') as File | null;
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

  // Upload full-board photo (always required)
  const ts = Date.now();
  const blob = await put(`stage-work/${id}/${unit.currentStage}/${ts}.jpg`, file, {
    access: 'private',
    contentType: file.type || 'image/jpeg',
  });

  // Upload zone-specific photos if provided
  let blobTop: { url: string } | null = null;
  let blobBottom: { url: string } | null = null;
  if (fileTop && fileTop.size > 0) {
    blobTop = await put(`stage-work/${id}/${unit.currentStage}/${ts}_top.jpg`, fileTop, {
      access: 'private',
      contentType: fileTop.type || 'image/jpeg',
    });
  }
  if (fileBottom && fileBottom.size > 0) {
    blobBottom = await put(`stage-work/${id}/${unit.currentStage}/${ts}_bottom.jpg`, fileBottom, {
      access: 'private',
      contentType: fileBottom.type || 'image/jpeg',
    });
  }

  // Mark as ANALYZING
  await prisma.stageWorkSubmission.update({
    where: { id: submission.id },
    data: {
      imageUrl:  blob.url,
      imageUrl2: blobTop?.url    ?? null,
      imageUrl3: blobBottom?.url ?? null,
      analysisStatus: 'ANALYZING',
      submittedAt: new Date(),
    },
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
            if ((c as { photoZone?: string | null }).photoZone) {
              const zLabel = { top: 'Top strip close-up', bottom: 'Bottom strip close-up', full: 'Full board photo' };
              parts.push(`  Photo zone      : ${zLabel[(c as { photoZone: string }).photoZone as keyof typeof zLabel] ?? (c as { photoZone: string }).photoZone} — inspect this component in that photo`);
            }
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

    // ── Fetch employee's captured images ──────────────────────────────────────
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

    // Fetch zone-specific photos if present
    // photoMap: zone → { buf, base64, w, h, mediaType }
    type ZonePhoto = { buf: Buffer; base64: string; w: number; h: number; mediaType: string };
    const photoMap: Record<string, ZonePhoto> = { full: { buf: imgBuf, base64, w: imgW, h: imgH, mediaType } };

    const fetchZonePhoto = async (url: string, fileRef: File): Promise<ZonePhoto> => {
      const res = await fetch(url, { headers: blobAuth });
      const buf = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(buf).metadata();
      return {
        buf,
        base64: buf.toString('base64'),
        w: meta.width ?? 1000,
        h: meta.height ?? 1000,
        mediaType: fileRef.type || 'image/jpeg',
      };
    };

    if (blobTop && fileTop)    photoMap['top']    = await fetchZonePhoto(blobTop.url,    fileTop);
    if (blobBottom && fileBottom) photoMap['bottom'] = await fetchZonePhoto(blobBottom.url, fileBottom);

    // ── Fetch reference images ────────────────────────────────────────────────
    type ImageBlock = {
      type: 'image';
      source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string };
    };
    type TextBlock = { type: 'text'; text: string };
    const contentBlocks: (ImageBlock | TextBlock)[] = [];

    // Board-level reference image — also keep buffer for per-position comparison crops
    let refImgBuf: Buffer | null = null;
    let refImgW = 1000;
    let refImgH = 1000;
    if (boardRefItem?.referenceImageUrl) {
      try {
        const refRes = await fetch(boardRefItem.referenceImageUrl, { headers: blobAuth });
        if (refRes.ok) {
          refImgBuf = Buffer.from(await refRes.arrayBuffer());
          const refMeta = await sharp(refImgBuf).metadata();
          refImgW = refMeta.width  ?? 1000;
          refImgH = refMeta.height ?? 1000;
          const refType = (refRes.headers.get('content-type') || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
          contentBlocks.push({ type: 'text', text: '══ BOARD REFERENCE IMAGE (correct completed board — use this as the gold standard) ══' });
          contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: refType, data: refImgBuf.toString('base64') } });
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

    // Employee's submitted photos — full board always shown; zone photos follow with labels
    const zoneLabels: Record<string, string> = {
      full:   'FULL BOARD PHOTO',
      top:    'TOP STRIP CLOSE-UP (edge components)',
      bottom: 'BOTTOM STRIP CLOSE-UP (edge components)',
    };
    const submittedZones = Object.keys(photoMap);
    contentBlocks.push({
      type: 'text',
      text: submittedZones.length > 1
        ? `══ SUBMITTED PHOTOS (${submittedZones.length} photos — full board + zone close-ups) ══\nUse the matching zone photo when inspecting zone-specific components.`
        : '══ SUBMITTED PHOTO (inspect this — compare against reference images above) ══',
    });
    for (const zone of ['full', 'top', 'bottom']) {
      const zp = photoMap[zone];
      if (!zp) continue;
      if (submittedZones.length > 1) {
        contentBlocks.push({ type: 'text', text: `── ${zoneLabels[zone] ?? zone.toUpperCase()} ──` });
      }
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: zp.mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: zp.base64 },
      });
    }

    // ── Per-position crops for small-footprint components ────────────────────
    // Each marker gets its own tight crop, upscaled + CLAHE sharpened.
    // Crop window and upscale resolution are SIZE-AWARE:
    //   micro → very tight window (0.025) + 480px → ~9× zoom  (0402 resistors, tiny SMD)
    //   mini  → tight window  (0.04)  + 400px → ~6× zoom  (0603, small caps)
    //   small → normal window (0.06)  + 320px → ~3× zoom  (0805, diodes, SOT-23)
    type MarkerPos = { x: number; y: number; label: string; size?: string };
    const SMALL_SIZES  = new Set(['micro', 'mini', 'small']);
    const CROP_PARAMS: Record<string, { half: number; px: number }> = {
      micro: { half: 0.025, px: 480 },  // ~9× zoom — ideal for 0402 / micro SMD
      mini:  { half: 0.040, px: 400 },  // ~6× zoom — ideal for 0603
      small: { half: 0.060, px: 320 },  // ~3× zoom — ideal for 0805 and larger
    };
    const MAX_PAIRS    = 12;     // increased to fit up to 12 component positions
    let   totalPairs   = 0;

    // Helper: extract a square CLAHE-enhanced crop from any buffer at normalised (nx, ny)
    // sizeHint drives the crop window + upscale resolution selection
    const makeCrop = async (
      buf: Buffer, bW: number, bH: number,
      nx: number, ny: number,
      sizeHint = 'small',
    ): Promise<Buffer> => {
      const params  = CROP_PARAMS[sizeHint] ?? CROP_PARAMS['small'];
      const cx      = Math.round(nx * bW);
      const cy      = Math.round(ny * bH);
      const halfPx  = Math.max(12, Math.round(params.half * Math.min(bW, bH)));
      const left    = Math.max(0, cx - halfPx);
      const top     = Math.max(0, cy - halfPx);
      const size    = Math.min(halfPx * 2, bW - left, bH - top);
      // Stronger CLAHE + sharpen for micro components
      const isMicro = sizeHint === 'micro';
      return sharp(buf)
        .extract({ left, top, width: size, height: size })
        .clahe({ width: isMicro ? 4 : 8, height: isMicro ? 4 : 8, maxSlope: isMicro ? 6 : 4 })
        .resize(params.px, params.px, { fit: 'fill', kernel: 'lanczos3' })
        .sharpen({ sigma: isMicro ? 2.0 : 1.5, m1: isMicro ? 0.8 : 0.5, m2: isMicro ? 3.5 : 2.5, x1: 2 })
        .jpeg({ quality: 92 })
        .toBuffer();
    };

    const smallItems = componentItems.filter(item => {
      if (!item.componentPositions) return false;
      try {
        const pos: MarkerPos[] = JSON.parse(item.componentPositions as string);
        return pos.some(p => SMALL_SIZES.has(p.size ?? 'small'));
      } catch { return false; }
    });

    if (smallItems.length > 0) {
      const hasRef = refImgBuf !== null;
      contentBlocks.push({
        type: 'text',
        text: [
          '══ PAD-LEVEL COMPARISON CROPS (CLAHE + sharpened, size-aware zoom) ══',
          hasRef
            ? 'For each position: REFERENCE crop (correct board) is shown first, then SUBMITTED crop.'
            : 'Each crop is centred on one expected component position from the submitted photo.',
          'Micro components use ~9× zoom, mini ~6×, small ~3×.',
          'PRESENT = component body clearly visible on pads.  MISSING = bare copper pads only, no component body.',
          'Sum PRESENT count per component group for the JSON response.',
        ].join('\n'),
      });

      for (const item of smallItems) {
        if (totalPairs >= MAX_PAIRS) break;

        let positions: MarkerPos[];
        try { positions = JSON.parse(item.componentPositions as string); }
        catch { continue; }

        const smallPos = positions.filter(p => SMALL_SIZES.has(p.size ?? 'small'));
        if (smallPos.length === 0) continue;

        // Determine the dominant size for this component's positions
        const dominantSize = smallPos.some(p => p.size === 'micro') ? 'micro'
          : smallPos.some(p => p.size === 'mini') ? 'mini' : 'small';

        contentBlocks.push({
          type: 'text',
          text: `▶ ${item.name} [${dominantSize}] — expect ${item.expectedCount ?? smallPos.length}, checking ${smallPos.length} position${smallPos.length > 1 ? 's' : ''}:`,
        });

        for (const pos of smallPos) {
          if (totalPairs >= MAX_PAIRS) break;

          const sizeHint = pos.size ?? 'small';

          try {
            // Reference crop (what a correct board looks like at this position)
            if (refImgBuf) {
              const refCrop = await makeCrop(refImgBuf, refImgW, refImgH, pos.x, pos.y, sizeHint);
              contentBlocks.push({ type: 'text', text: `  ${pos.label} REFERENCE [${sizeHint}]:` });
              contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: refCrop.toString('base64') } });
            }

            // Submitted crop — use zone-specific photo if available, else full board
            const itemZone = (item as { photoZone?: string | null }).photoZone ?? 'full';
            const zp = photoMap[itemZone] ?? photoMap['full'];
            const subCrop = await makeCrop(zp.buf, zp.w, zp.h, pos.x, pos.y, sizeHint);
            contentBlocks.push({ type: 'text', text: `  ${pos.label} SUBMITTED @ (${Math.round(pos.x * 100)}%,${Math.round(pos.y * 100)}%) [${sizeHint} zoom]:` });
            contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: subCrop.toString('base64') } });

            totalPairs++;
          } catch (cropErr) {
            console.error('[crops] Failed for', item.name, pos.label, cropErr);
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
      "status": "PRESENT" | "MISSING" | "DEFECTIVE" | "WRONG_ORIENTATION" | "SOLDER_ISSUE" | "MISPLACED" | "CANNOT_CONFIRM",
      "note": "specific finding — include count if mismatch, exact location of problem, orientation issue detail",
      "location": "board position, e.g. 'top-left group, 3rd unit' or 'bottom-center strip'"
    }
  ],
  "summary": "1–2 sentences: overall assessment with counts verified and any issues found"
}

STRICT RULES:
— Count every visible unit individually where possible.
— CRITICAL DISTINCTION — use the correct status:
    PRESENT        = component body clearly visible on its pads ✓
    MISSING        = you can see BARE COPPER PADS with NO component body at that exact position — high confidence the part is absent
    CANNOT_CONFIRM = the component is expected but the photo scale/angle does not allow individual unit verification (small SMD, crowded area, partially obscured) — DO NOT assume MISSING
    DEFECTIVE      = component present but visibly damaged/burned/cracked
    WRONG_ORIENTATION = component present but rotated incorrectly
    SOLDER_ISSUE   = visible solder defect (bridge, cold joint, tombstone)
    MISPLACED      = component present but in wrong board zone
— NEVER use MISSING just because you cannot identify/see a small component — that is CANNOT_CONFIRM.
— ONLY use MISSING when bare pads are clearly visible at the expected position.
— CANNOT_CONFIRM does NOT cause a FAIL on its own — it flags for supervisor awareness only.
— overall = FAIL ONLY when a REQUIRED component has status MISSING, DEFECTIVE, WRONG_ORIENTATION, SOLDER_ISSUE, or MISPLACED.
— overall = PASS when all required components are PRESENT or CANNOT_CONFIRM with no confirmed defects.
— If orientation rule is given and ANY unit clearly violates it, status = WRONG_ORIENTATION — immediate FAIL.
— If the image is blurry, too dark, or board not visible at all: overall = FAIL, explain in summary.
— Compare against the board reference image for position, zone, and orientation verification.
— For components with "Precise positions" listed: cross-reference those exact coordinates on the submitted photo.
— For components with pad-level crops: check EACH crop individually — bare copper pads = MISSING at that position, component body on pads = PRESENT. Sum the PRESENT pads to get your found count.
— Do NOT guess from the full board photo for components that have pad-level crops — use the crops as ground truth.`,
    });

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: contentBlocks }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    const match   = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed   = JSON.parse(match[0]);
      analysisIssues = parsed.components ?? [];
      analysisSummary = parsed.summary ?? '';

      // Re-derive overall from component statuses so that CANNOT_CONFIRM never causes a FAIL.
      // Only these statuses on a REQUIRED component should trigger FAIL:
      const FAIL_STATUSES = new Set(['MISSING', 'DEFECTIVE', 'WRONG_ORIENTATION', 'SOLDER_ISSUE', 'MISPLACED']);
      const requiredNames = componentItems.filter(c => c.required).map(c => c.name.toLowerCase());
      const hasConfirmedFail = analysisIssues.some(issue => {
        if (!FAIL_STATUSES.has(issue.status)) return false;
        // Check if this component is marked required in the manifest
        return requiredNames.length === 0 || // if no required info, respect AI's call
          requiredNames.some(rn => issue.name.toLowerCase().includes(rn) || rn.includes(issue.name.toLowerCase().split('(')[0].trim()));
      });
      analysisResult = hasConfirmedFail ? 'FAIL' : 'PASS';

      // If there are CANNOT_CONFIRM items, append a note to the summary
      const unconfirmed = analysisIssues.filter(i => i.status === 'CANNOT_CONFIRM');
      if (unconfirmed.length > 0 && analysisResult === 'PASS') {
        analysisSummary += ` (${unconfirmed.length} component${unconfirmed.length > 1 ? 's' : ''} could not be confirmed at this photo scale — supervisor spot-check recommended)`;
      }
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
