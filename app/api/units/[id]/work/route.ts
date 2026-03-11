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

  // Return required photo zones + suggested zoom levels for this stage
  const zoneItems = await prisma.stageChecklistItem.findMany({
    where: {
      stage: unit.currentStage,
      active: true,
      isBoardReference: false,
      OR: [{ productId: unit.productId ?? undefined }, { productId: null }],
    },
    select: { photoZone: true, componentPositions: true },
  });

  // 'full' is ALWAYS required — it's the baseline for every stage
  const extraZones = Array.from(new Set(
    zoneItems.map(z => z.photoZone).filter((z): z is string => !!z && z !== 'full'),
  ));
  const zones = ['full', ...extraZones];

  // Suggested camera zoom per zone (derived from smallest component size in that zone)
  const SIZE_ZOOM: Record<string, number> = { micro: 3.5, mini: 2.5, small: 2.0 };
  const zoneZooms: Record<string, number> = { full: 1 };
  for (const z of extraZones) zoneZooms[z] = 2.0; // default 2× for close-up zones
  for (const item of zoneItems) {
    if (!item.photoZone || !item.componentPositions) continue;
    try {
      const positions: Array<{ size?: string }> = JSON.parse(item.componentPositions as string);
      for (const pos of positions) {
        const sz = pos.size ?? 'small';
        zoneZooms[item.photoZone] = Math.max(zoneZooms[item.photoZone] ?? 2.0, SIZE_ZOOM[sz] ?? 2.0);
      }
    } catch { /* skip */ }
  }

  return NextResponse.json({ active, history, stage: unit.currentStage, zones, zoneZooms });
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
          const m = await sharp(refImgBuf, { failOn: 'none' }).metadata();
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
        const rawRef = Buffer.from(await r.arrayBuffer());
        const resizedRef = await sharp(rawRef, { failOn: 'none' }).resize(1568, 1568, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
        compRefImages.push({ name: item.name, base64: resizedRef.toString('base64'), mediaType: 'image/jpeg' });
      } catch { /* skip */ }
    }

    // ── Per-position crop helper (SIZE-AWARE) ─────────────────────────────────
    // micro → 2.5% window / 480px → ~9× zoom   (0402 resistors, tiny SMD)
    // mini  → 4.0% window / 400px → ~6× zoom   (0603)
    // small → 6.0% window / 320px → ~3× zoom   (0805, SOT-23)
    type MarkerPos = { x: number; y: number; label: string; size?: string };
    const SMALL_SIZES = new Set(['micro', 'mini', 'small']);
    const CROP_PARAMS: Record<string, { half: number; px: number }> = {
      micro: { half: 0.025, px: 480 },
      mini:  { half: 0.040, px: 400 },
      small: { half: 0.060, px: 320 },
    };

    const makeCrop = async (buf: Buffer, bW: number, bH: number, nx: number, ny: number, sizeHint = 'small'): Promise<Buffer> => {
      const p      = CROP_PARAMS[sizeHint] ?? CROP_PARAMS['small'];
      const cx     = Math.round(nx * bW), cy = Math.round(ny * bH);
      const halfPx = Math.max(12, Math.round(p.half * Math.min(bW, bH)));
      const left   = Math.max(0, cx - halfPx), top = Math.max(0, cy - halfPx);
      const size   = Math.min(halfPx * 2, bW - left, bH - top);
      const isMicro = sizeHint === 'micro';
      return sharp(buf, { failOn: 'none' })
        .extract({ left, top, width: size, height: size })
        .clahe({ width: isMicro ? 4 : 8, height: isMicro ? 4 : 8, maxSlope: isMicro ? 6 : 4 })
        .resize(p.px, p.px, { fit: 'fill', kernel: 'lanczos3' })
        .sharpen({ sigma: isMicro ? 2.0 : 1.5, m1: isMicro ? 0.8 : 0.5, m2: isMicro ? 3.5 : 2.5, x1: 2 })
        .jpeg({ quality: 92 })
        .toBuffer();
    };

    // ── Downscale any photo to Claude Vision's safe size ──────────────────────
    // Anthropic rejects base64 images that exceed ~5 MB after encoding.
    // 1568 px max-side + 85 % JPEG keeps every photo well under the limit while
    // retaining enough detail for component-level inspection.
    // `failOn: 'none'` tolerates minor JPEG corruption from phone cameras / canvas.toBlob()
    const toAiJpeg = (buf: Buffer): Promise<Buffer> =>
      sharp(buf, { failOn: 'none' })
        .resize(1568, 1568, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

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

    // Pre-compute AI-safe (downscaled) reference image once for all zones
    const refImgBufAi: Buffer | null = refImgBuf ? await toAiJpeg(refImgBuf) : null;

    // ── Run one Claude Vision call per zone ────────────────────────────────────
    type Issue = { name: string; status: string; note: string; location?: string };
    type IB = { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'|'image/png'|'image/webp'|'image/gif'; data: string } };
    type TB = { type: 'text'; text: string };
    const allIssues: Issue[] = [];
    const summaries: string[] = [];
    let anyFail = false;

    // Sizes to skip until RPi high-res cameras arrive.
    // Remove 'mini' and 'micro' from this set once hardware is in place.
    const SKIP_SIZES = new Set(['micro', 'mini']);
    const isSkippedSize = (item: typeof componentItems[number]): boolean => {
      if (!item.componentPositions) return false;
      try {
        const positions = JSON.parse(item.componentPositions as string) as MarkerPos[];
        return positions.length > 0 && positions.every(p => SKIP_SIZES.has(p.size ?? ''));
      } catch { return false; }
    };

    for (const [zone, zoneItemsAll] of Array.from(componentsByZone.entries())) {
      // Skip micro/mini-only components entirely — phone cameras can't resolve them reliably
      const items = zoneItemsAll.filter(item => !isSkippedSize(item));

      const photo = photoMap[zone] ?? photoMap['full'];
      if (!photo) continue;

      const { buf: zoneBuf, mediaType: zoneMediaType } = photo;
      const zm = await sharp(zoneBuf, { failOn: 'none' }).metadata();
      const zW = zm.width ?? 1000, zH = zm.height ?? 1000;

      const zoneLabel = zone === 'top' ? 'TOP STRIP CLOSE-UP' : zone === 'bottom' ? 'BOTTOM STRIP CLOSE-UP' : 'FULL BOARD';
      const blocks: (IB | TB)[] = [];

      // Board reference
      if (refImgBufAi) {
        blocks.push({ type: 'text', text: '══ BOARD REFERENCE (correct completed board — gold standard) ══' });
        blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: refImgBufAi.toString('base64') } });
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

      // Submitted photo for this zone (downscaled to stay within Anthropic's 5 MB limit)
      const zoneBufAi = await toAiJpeg(zoneBuf);
      blocks.push({ type: 'text', text: `══ SUBMITTED PHOTO — ${zoneLabel} ══` });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: zoneBufAi.toString('base64') } });

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
          const dominantSize = smallPos.some(p => p.size === 'micro') ? 'micro'
            : smallPos.some(p => p.size === 'mini') ? 'mini' : 'small';
          blocks.push({ type: 'text', text: `▶ ${item.name} [${dominantSize}] — expect ${item.expectedCount ?? smallPos.length}, checking ${smallPos.length} position${smallPos.length > 1 ? 's' : ''}:` });
          for (const pos of smallPos) {
            if (pairCount >= 8) break;
            const sh = pos.size ?? 'small';
            try {
              if (refImgBuf) {
                const rc = await makeCrop(refImgBuf, refImgW, refImgH, pos.x, pos.y, sh);
                blocks.push({ type: 'text', text: `  ${pos.label} REFERENCE [${sh}]:` });
                blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: rc.toString('base64') } });
              }
              const sc = await makeCrop(zoneBuf, zW, zH, pos.x, pos.y, sh);
              blocks.push({ type: 'text', text: `  ${pos.label} SUBMITTED @ (${Math.round(pos.x * 100)}%,${Math.round(pos.y * 100)}%) [${sh} zoom]:` });
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

CRITICAL FIRST CHECK — BOARD VERIFICATION:
Before inspecting components, verify the submitted photo shows an electronic PCB/circuit board.
If the photo does NOT show a PCB (e.g. random object, person, wall, fan, ceiling, hand, etc.):
  → overall = "FAIL", components = [], summary = "[NOT_A_BOARD] Photo does not show a PCB — retake with the correct board in frame."
  Do NOT proceed with component inspection. Return immediately.
${refImgBuf ? 'Also verify the submitted board matches the reference board type (same PCB layout). If it is a completely different board type, include this in the summary.' : ''}

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
    { "name": "name (e.g. 'Resistor (found 7 of 7)')", "status": "PRESENT"|"MISSING"|"DEFECTIVE"|"WRONG_ORIENTATION"|"SOLDER_ISSUE"|"MISPLACED"|"CANNOT_CONFIRM", "note": "specific finding with count and location", "location": "position on board" }
  ],
  "summary": "1–2 sentences with counts and issues"
}

STRICT RULES:
— Count every unit individually — do not guess.
— CRITICAL status rules:
    PRESENT        = component body clearly visible on pads ✓
    MISSING        = bare copper pads visible, NO component body — high confidence part absent
    CANNOT_CONFIRM = photo scale/angle prevents individual unit verification — DO NOT assume MISSING
    DEFECTIVE      = present but visibly damaged/burned/cracked
    WRONG_ORIENTATION = present but rotated incorrectly
    SOLDER_ISSUE   = visible solder defect (bridge, cold joint, tombstone)
    MISPLACED      = present but in wrong board zone
— NEVER use MISSING for small components you simply cannot see — that is CANNOT_CONFIRM.
— ONLY use MISSING when bare pads are clearly visible at expected position.
— micro/mini/small sized components: if individual units cannot be clearly counted, always use CANNOT_CONFIRM. These are treated as non-mandatory until high-resolution cameras are installed.
— CANNOT_CONFIRM does NOT cause FAIL on its own — it flags for supervisor spot-check.
— overall = FAIL ONLY when a REQUIRED component is MISSING, DEFECTIVE, WRONG_ORIENTATION, SOLDER_ISSUE, or MISPLACED.
— overall = PASS when all required components are PRESENT or CANNOT_CONFIRM with no confirmed defects.
— If image is blurry or board not visible: overall = FAIL.
— For pad-level crops: bare copper = MISSING, component body = PRESENT. Sum PRESENT for found count.
— Crops are ground truth — do NOT override crop evidence with full-photo guessing.` });

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: blocks }],
      });

      const rawText = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const match   = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed     = JSON.parse(match[0]);
        const components = (parsed.components ?? []) as Issue[];
        const FAIL_STATUSES = new Set(['MISSING', 'DEFECTIVE', 'WRONG_ORIENTATION', 'SOLDER_ISSUE', 'MISPLACED']);
        // Primary: trust the AI's own overall judgment.
        // The AI has the full manifest and is explicitly instructed to set overall=FAIL
        // only when a REQUIRED component has a confirmed issue.
        // Safety gate: require at least one actual fail-status component so a
        // CANNOT_CONFIRM-only response can never trigger a FAIL.
        const hasAnyFailStatus = components.some(issue => FAIL_STATUSES.has(issue.status));
        if (parsed.overall === 'FAIL' && hasAnyFailStatus) anyFail = true;
        // Belt-and-suspenders: also fail if a required (non-small) component is flagged.
        const isSmallOnly = (item: typeof items[number]): boolean => {
          if (!item.componentPositions) return false;
          try {
            const positions = JSON.parse(item.componentPositions as string) as MarkerPos[];
            return positions.length > 0 && positions.every(p => SMALL_SIZES.has(p.size ?? ''));
          } catch { return false; }
        };
        const requiredNames = items.filter(c => c.required && !isSmallOnly(c)).map(c => c.name.toLowerCase());
        const hasConfirmedFail = components.some(issue => {
          if (!FAIL_STATUSES.has(issue.status)) return false;
          return requiredNames.length === 0 ||
            requiredNames.some(rn => issue.name.toLowerCase().includes(rn) || rn.includes(issue.name.toLowerCase().split('(')[0].trim()));
        });
        if (hasConfirmedFail) anyFail = true;
        allIssues.push(...components);
        // Append CANNOT_CONFIRM count to summary if any
        const unconfirmed = components.filter(i => i.status === 'CANNOT_CONFIRM').length;
        const summaryText = (parsed.summary ?? '') + (unconfirmed > 0 ? ` (${unconfirmed} unconfirmed — supervisor spot-check recommended)` : '');
        if (summaryText.trim()) summaries.push(zone !== 'full' ? `[${zoneLabel}] ${summaryText}` : summaryText);
      }
    }

    // If no checklist items were configured for this stage
    if (componentsByZone.size === 0) {
      if (refImgBufAi) {
        // Case A: Board reference exists but no component items — run board-identity check
        const genericPhoto = photoMap['full'];
        if (genericPhoto) {
          const gBlocks: (IB | TB)[] = [];
          gBlocks.push({ type: 'text', text: '══ BOARD REFERENCE (correct completed board) ══' });
          gBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: refImgBufAi.toString('base64') } });
          const genericBufAi = await toAiJpeg(genericPhoto.buf);
          gBlocks.push({ type: 'text', text: '══ SUBMITTED PHOTO ══' });
          gBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: genericBufAi.toString('base64') } });
          gBlocks.push({ type: 'text', text:
`You are a PCB quality-control AI for SMX Drives.
Stage: ${unit.currentStage.replace(/_/g, ' ')} | Serial: ${unit.serialNumber}

CRITICAL FIRST CHECK:
1. Verify the submitted photo shows an electronic PCB/circuit board.
   If NOT a PCB (e.g. random object, person, wall, fan, ceiling, hand, etc.):
   → overall = "FAIL", components = [], summary = "[NOT_A_BOARD] Photo does not show a PCB — retake with the correct board in frame."
2. Verify the submitted board matches the reference board (same PCB layout/type).
   If it is a completely different board type:
   → overall = "FAIL", components = [], summary = "[NOT_A_BOARD] Submitted board does not match the reference board type."

If the board matches the reference, check for obvious assembly issues: missing major components, solder bridges, burnt parts, wrong orientation.
No component manifest has been configured yet, so only check for obvious visual defects.

Respond ONLY with valid JSON — no markdown fences:
{ "overall": "PASS" or "FAIL", "components": [], "summary": "1–2 sentence visual assessment" }
RULES: FAIL if photo is not a PCB or doesn't match reference. FAIL on clear visible defects. PASS only if correct board with no obvious issues.` });
          const gMsg = await anthropic.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 512,
            messages: [{ role: 'user', content: gBlocks }],
          });
          const gText  = gMsg.content[0].type === 'text' ? gMsg.content[0].text : '';
          const gMatch = gText.match(/\{[\s\S]*\}/);
          if (gMatch) {
            const gParsed = JSON.parse(gMatch[0]);
            if (gParsed.overall !== 'PASS') anyFail = true;
            if (gParsed.summary) summaries.push(gParsed.summary);
          }
        }
      } else {
        // Case B: No board reference AND no component items — cannot inspect, fail immediately
        anyFail = true;
        summaries.push('[NO_CRITERIA] No inspection criteria configured for this stage. Ask an admin to set up the checklist.');
      }
    }

    analysisResult  = anyFail ? 'FAIL' : 'PASS';
    analysisIssues  = allIssues;
    analysisSummary = summaries.join(' | ') || 'Analysis complete.';

  } catch (err) {
    // Log full error so it appears in Vercel Function Logs
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[AI Vision ERROR]', errMsg);
    if (err instanceof Error && err.stack) console.error(err.stack);
    // IMPORTANT: default to FAIL — never silently pass a unit when AI couldn't run
    analysisResult  = 'FAIL';
    // Include error hint so the manager screen shows what went wrong
    const isAuthErr  = errMsg.toLowerCase().includes('auth') || errMsg.toLowerCase().includes('api key') || errMsg.toLowerCase().includes('401');
    const isTimeout  = errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('timed out');
    const errHint    = isAuthErr ? 'API key issue — check ANTHROPIC_API_KEY in Vercel env vars.'
      : isTimeout ? 'AI request timed out — try a smaller photo or retry.'
      : `Error: ${errMsg.slice(0, 120)}`;
    analysisSummary = `AI_UNAVAILABLE: ${errHint}`;
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
