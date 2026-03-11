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
    select: { currentStage: true, currentStatus: true, productId: true },
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

  // Return required photo zones for this stage (worker UI uses this to build multi-step flow)
  const zoneItems = await prisma.stageChecklistItem.findMany({
    where: {
      stage: unit.currentStage,
      active: true,
      isBoardReference: false,
      OR: [{ productId: unit.productId ?? undefined }, { productId: null }],
    },
    select: { photoZone: true },
  });
  const zones = Array.from(new Set(zoneItems.map(z => z.photoZone ?? 'full')));

  return NextResponse.json({ active, history, stage: unit.currentStage, zones });
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
  const file  = formData.get('image') as File | null;
  const file2 = (formData.get('file2') ?? formData.get('image2')) as File | null;  // top-strip close-up
  const file3 = (formData.get('file3') ?? formData.get('image3')) as File | null;  // bottom-strip close-up
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

  // Upload photos to Vercel Blob (upload in parallel)
  const ts = Date.now();
  const [blob, blob2, blob3] = await Promise.all([
    put(`stage-work/${id}/${unit.currentStage}/${ts}-1.jpg`, file,  { access: 'private', contentType: file.type  || 'image/jpeg' }),
    file2 ? put(`stage-work/${id}/${unit.currentStage}/${ts}-2.jpg`, file2, { access: 'private', contentType: file2.type || 'image/jpeg' }) : null,
    file3 ? put(`stage-work/${id}/${unit.currentStage}/${ts}-3.jpg`, file3, { access: 'private', contentType: file3.type || 'image/jpeg' }) : null,
  ]);

  // Mark as ANALYZING
  await prisma.stageWorkSubmission.update({
    where: { id: submission.id },
    data: {
      imageUrl:  blob.url,
      imageUrl2: blob2?.url ?? null,
      imageUrl3: blob3?.url ?? null,
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

  // ── Claude Vision — zone-based multi-photo analysis ─────────────────────────
  let analysisResult: 'PASS' | 'FAIL' = 'PASS';
  let analysisIssues: { name: string; status: string; note: string; location?: string }[] = [];
  let analysisSummary = 'Analysis complete.';

  try {
    const blobAuth = { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` };

    // ── Fetch all submitted photo buffers in parallel ─────────────────────────
    const [imgBuf, imgBuf2, imgBuf3] = await Promise.all([
      fetch(blob.url,  { headers: blobAuth }).then(r => r.arrayBuffer()).then(b => Buffer.from(b)),
      blob2 ? fetch(blob2.url, { headers: blobAuth }).then(r => r.arrayBuffer()).then(b => Buffer.from(b)) : null,
      blob3 ? fetch(blob3.url, { headers: blobAuth }).then(r => r.arrayBuffer()).then(b => Buffer.from(b)) : null,
    ]);

    // Map zone → { buf, mediaType }
    const photoMap: Record<string, { buf: Buffer; mediaType: string }> = {
      full: { buf: imgBuf, mediaType: file.type  || 'image/jpeg' },
      ...(imgBuf2 ? { top:    { buf: imgBuf2, mediaType: file2?.type || 'image/jpeg' } } : {}),
      ...(imgBuf3 ? { bottom: { buf: imgBuf3, mediaType: file3?.type || 'image/jpeg' } } : {}),
    };

    // ── Fetch board reference image ───────────────────────────────────────────
    let refImgBuf: Buffer | null = null;
    let refImgW = 1000, refImgH = 1000;
    if (boardRefItem?.referenceImageUrl) {
      try {
        const refRes = await fetch(boardRefItem.referenceImageUrl, { headers: blobAuth });
        if (refRes.ok) {
          refImgBuf = Buffer.from(await refRes.arrayBuffer());
          const m = await sharp(refImgBuf).metadata();
          refImgW = m.width ?? 1000; refImgH = m.height ?? 1000;
        }
      } catch { /* skip */ }
    }

    // ── Fetch per-component reference images ──────────────────────────────────
    const compRefImages: { name: string; base64: string; mediaType: string }[] = [];
    for (const item of componentItems) {
      if (!item.referenceImageUrl) continue;
      try {
        const r = await fetch(item.referenceImageUrl, { headers: blobAuth });
        if (!r.ok) continue;
        const ct = r.headers.get('content-type') || 'image/jpeg';
        if (!['image/jpeg','image/png','image/webp','image/gif'].includes(ct)) continue;
        compRefImages.push({ name: item.name, base64: Buffer.from(await r.arrayBuffer()).toString('base64'), mediaType: ct });
      } catch { /* skip */ }
    }

    // ── Per-position crop helper ───────────────────────────────────────────────
    type MarkerPos = { x: number; y: number; label: string; size?: string };
    const SMALL_SIZES = new Set(['micro', 'mini', 'small']);
    const CROP_HALF   = 0.06;
    const UPSCALE_PX  = 320;

    const makeCrop = async (buf: Buffer, bW: number, bH: number, nx: number, ny: number): Promise<Buffer> => {
      const cx = Math.round(nx * bW), cy = Math.round(ny * bH);
      const halfPx = Math.max(20, Math.round(CROP_HALF * Math.min(bW, bH)));
      const left = Math.max(0, cx - halfPx), top = Math.max(0, cy - halfPx);
      const size = Math.min(halfPx * 2, bW - left, bH - top);
      return sharp(buf)
        .extract({ left, top, width: size, height: size })
        .clahe({ width: 8, height: 8, maxSlope: 4 })
        .resize(UPSCALE_PX, UPSCALE_PX, { fit: 'fill', kernel: 'lanczos3' })
        .sharpen({ sigma: 1.5, m1: 0.5, m2: 2.5, x1: 2 })
        .jpeg({ quality: 92 })
        .toBuffer();
    };

    // ── Build manifest text for a subset of items ─────────────────────────────
    const buildManifest = (items: typeof componentItems): string => {
      if (items.length === 0) return 'No components for this zone.';
      return items.map((c: typeof componentItems[number], i: number) => {
        const p: string[] = [];
        p.push(`${i + 1}. ${c.name}`);
        if (c.expectedCount)   p.push(`  Expected count  : ${c.expectedCount}`);
        if (c.boardLocation) {
          const ids = parseZoneIds(c.boardLocation);
          p.push(`  Board location  : ${ids.length > 0 ? zonesToText(ids) : c.boardLocation}`);
        }
        if (c.orientationRule) p.push(`  Orientation rule: ${c.orientationRule}`);
        if (c.description)     p.push(`  Additional notes: ${c.description}`);
        if (c.componentPositions) {
          try {
            const positions = JSON.parse(c.componentPositions as string) as MarkerPos[];
            if (positions.length > 0) {
              const hints = positions.map(q => `${q.label}@(${Math.round(q.x * 100)}%,${Math.round(q.y * 100)}%)`).join('  ');
              p.push(`  Precise positions: ${hints}  ← x% from left, y% from top`);
            }
          } catch { /* skip */ }
        }
        p.push(`  Required        : ${c.required ? 'YES — board FAILS if any issue found' : 'NO'}`);
        return p.join('\n');
      }).join('\n\n');
    };

    // ── Group components by photo zone ────────────────────────────────────────
    const componentsByZone = new Map<string, typeof componentItems>();
    for (const item of componentItems) {
      const zone = (item.photoZone as string | null) ?? 'full';
      if (!componentsByZone.has(zone)) componentsByZone.set(zone, []);
      componentsByZone.get(zone)!.push(item);
    }
    // Backward compat: if no zone assignments, put all in 'full'
    if (componentsByZone.size === 0 && componentItems.length > 0) {
      componentsByZone.set('full', componentItems);
    }

    // ── Run one Claude Vision call per zone ────────────────────────────────────
    type Issue = { name: string; status: string; note: string; location?: string };
    type IB = { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'|'image/png'|'image/webp'|'image/gif'; data: string } };
    type TB = { type: 'text'; text: string };
    const allIssues: Issue[] = [];
    const summaries: string[] = [];
    let anyFail = false;

    for (const [zone, items] of Array.from(componentsByZone.entries())) {
      const photo = photoMap[zone] ?? photoMap['full'];
      if (!photo) continue;

      const { buf: zoneBuf, mediaType: zoneMediaType } = photo;
      const zm = await sharp(zoneBuf).metadata();
      const zW = zm.width ?? 1000, zH = zm.height ?? 1000;

      const zoneLabel = zone === 'top' ? 'TOP STRIP CLOSE-UP' : zone === 'bottom' ? 'BOTTOM STRIP CLOSE-UP' : 'FULL BOARD';
      const blocks: (IB | TB)[] = [];

      // Board reference
      if (refImgBuf) {
        blocks.push({ type: 'text', text: '══ BOARD REFERENCE (correct completed board — gold standard) ══' });
        blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: refImgBuf.toString('base64') } });
      }

      // Per-component close-up references for this zone
      const zoneRefs = compRefImages.filter(r => items.some((c: typeof componentItems[number]) => c.name === r.name));
      if (zoneRefs.length > 0) {
        blocks.push({ type: 'text', text: `══ COMPONENT REFERENCE IMAGES (${zoneRefs.length} close-ups) ══` });
        for (const ref of zoneRefs) {
          blocks.push({ type: 'text', text: `Reference: ${ref.name}` });
          blocks.push({ type: 'image', source: { type: 'base64', media_type: ref.mediaType as IB['source']['media_type'], data: ref.base64 } });
        }
      }

      // Submitted photo for this zone
      blocks.push({ type: 'text', text: `══ SUBMITTED PHOTO — ${zoneLabel} ══` });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: zoneMediaType as IB['source']['media_type'], data: zoneBuf.toString('base64') } });

      // Pad-level crops for small components in this zone
      const smallItems = items.filter(item => {
        if (!item.componentPositions) return false;
        try { return (JSON.parse(item.componentPositions as string) as MarkerPos[]).some(p => SMALL_SIZES.has(p.size ?? 'small')); }
        catch { return false; }
      });

      if (smallItems.length > 0) {
        blocks.push({ type: 'text', text: ['══ PAD-LEVEL CROPS (CLAHE + 5× zoom) ══', refImgBuf ? 'REFERENCE crop first, then SUBMITTED crop.' : 'Crops centred on expected component positions.', 'PRESENT = component body on pads. MISSING = bare copper only.'].join('\n') });
        let pairCount = 0;
        for (const item of smallItems) {
          if (pairCount >= 8) break;
          let positions: MarkerPos[];
          try { positions = JSON.parse(item.componentPositions as string); } catch { continue; }
          const smallPos = positions.filter(p => SMALL_SIZES.has(p.size ?? 'small'));
          if (smallPos.length === 0) continue;
          blocks.push({ type: 'text', text: `▶ ${item.name} — expect ${item.expectedCount ?? smallPos.length}, checking ${smallPos.length} position${smallPos.length > 1 ? 's' : ''}:` });
          for (const pos of smallPos) {
            if (pairCount >= 8) break;
            try {
              if (refImgBuf) {
                const rc = await makeCrop(refImgBuf, refImgW, refImgH, pos.x, pos.y);
                blocks.push({ type: 'text', text: `  ${pos.label} REFERENCE:` });
                blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: rc.toString('base64') } });
              }
              const sc = await makeCrop(zoneBuf, zW, zH, pos.x, pos.y);
              blocks.push({ type: 'text', text: `  ${pos.label} SUBMITTED @ (${Math.round(pos.x * 100)}%,${Math.round(pos.y * 100)}%):` });
              blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: sc.toString('base64') } });
              pairCount++;
            } catch (e) { console.error('[crops]', item.name, pos.label, e); }
          }
        }
      }

      // Prompt for this zone
      const zoneManifest   = buildManifest(items);
      const zoneExpected   = items.reduce((s: number, c: typeof componentItems[number]) => s + (c.expectedCount ?? 1), 0);
      blocks.push({ type: 'text', text:
`You are a precision PCB quality-control AI for SMX Drives electronic controller manufacturing.
Inspect the SUBMITTED PHOTO (${zoneLabel}) and verify every component in the manifest below.
${refImgBuf ? 'A board reference image has been provided — use it as the gold standard.' : ''}
${zone !== 'full' ? `Note: this is a CLOSE-UP photo of the ${zone.toUpperCase()} section — components are larger and more visible.` : ''}

Stage: ${unit.currentStage.replace(/_/g, ' ')} | Serial: ${unit.serialNumber} | Product: ${unit.product?.name ?? 'Unknown'}

══ COMPONENT MANIFEST (${zoneLabel}) ══
${zoneManifest}
Total parts expected in this zone: ${zoneExpected}

Verify for EACH component: COUNT, LOCATION, ORIENTATION, ALIGNMENT, DAMAGE.

Respond ONLY with valid JSON — no markdown fences, no extra text:
{
  "overall": "PASS" or "FAIL",
  "components": [
    { "name": "name (e.g. 'Resistor (found 7 of 7)')", "status": "PRESENT"|"MISSING"|"DEFECTIVE"|"WRONG_ORIENTATION"|"SOLDER_ISSUE"|"MISPLACED", "note": "specific finding with count and location", "location": "position on board" }
  ],
  "summary": "1–2 sentences with counts and issues"
}

STRICT RULES:
— Count every unit individually — do not guess.
— PASS only when all REQUIRED components present with correct count, orientation, and alignment.
— If image is blurry or board not visible: overall = FAIL.
— For pad-level crops: bare copper = MISSING, component body = PRESENT. Sum PRESENT for found count.
— Crops are ground truth — do NOT override crop evidence with full-photo guessing.` });

      const msg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        messages: [{ role: 'user', content: blocks }],
      });

      const rawText = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const match   = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.overall !== 'PASS') anyFail = true;
        allIssues.push(...(parsed.components ?? []));
        if (parsed.summary) summaries.push(zone !== 'full' ? `[${zoneLabel}] ${parsed.summary}` : parsed.summary);
      }
    }

    analysisResult  = anyFail ? 'FAIL' : 'PASS';
    analysisIssues  = allIssues;
    analysisSummary = summaries.join(' | ') || 'Analysis complete.';

  } catch (err) {
    // Log full error so it appears in Vercel Function Logs
    console.error('[AI Vision ERROR]', err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    // IMPORTANT: default to FAIL — never silently pass a unit when AI couldn't run
    analysisResult  = 'FAIL';
    analysisSummary = 'AI_UNAVAILABLE: image saved, manual review required by manager.';
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
