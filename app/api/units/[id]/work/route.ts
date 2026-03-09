// GET  /api/units/[id]/work  — get active submission + history
// POST /api/units/[id]/work  — start work (record start time)
// PUT  /api/units/[id]/work  — submit image + AI analysis
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';
import Anthropic from '@anthropic-ai/sdk';
import { parseZoneIds, zonesToText } from '@/lib/boardZones';

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
    access: 'public',
    contentType: file.type || 'image/jpeg',
  });

  // Mark as ANALYZING
  await prisma.stageWorkSubmission.update({
    where: { id: submission.id },
    data: { imageUrl: blob.url, analysisStatus: 'ANALYZING', submittedAt: new Date() },
  });

  // Fetch all checklist items for this stage
  const checklist = await prisma.stageChecklistItem.findMany({
    where: { stage: unit.currentStage, active: true },
    orderBy: { sortOrder: 'asc' },
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
    const imgRes    = await fetch(blob.url);
    const imgBuffer = await imgRes.arrayBuffer();
    const base64    = Buffer.from(imgBuffer).toString('base64');
    const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';

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
        const refRes = await fetch(boardRefItem.referenceImageUrl);
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
        const refRes = await fetch(item.referenceImageUrl);
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
— Compare against the board reference image for position, zone, and orientation verification.`,
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
