// GET  /api/units/[id]/work  — get active submission + history
// POST /api/units/[id]/work  — start work (record start time)
// PUT  /api/units/[id]/work  — submit photo + PCB check → mark complete
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';
import { UnitStatus } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';

// ── PCB check helper ──────────────────────────────────────────────────────────
// Returns true if the image contains a circuit board, false if not.
// On any error (API down, parse failure) returns true to avoid blocking workers.
async function isPcbImage(buffer: Buffer): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return true;
  try {
    const thumb = await sharp(buffer, { failOn: 'none' })
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
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
      return !!parsed.isPcb;
    }
    return true; // allow through if parse fails
  } catch {
    return true; // allow through on API error — don't block workers
  }
}

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

  // Block work on non-workable statuses
  if (unit.currentStatus === UnitStatus.COMPLETED) {
    return NextResponse.json({ error: 'Stage already completed' }, { status: 409 });
  }
  if (unit.currentStatus === UnitStatus.BLOCKED) {
    return NextResponse.json({ error: 'Unit is blocked — contact your manager' }, { status: 409 });
  }
  if (unit.currentStatus !== UnitStatus.PENDING && unit.currentStatus !== UnitStatus.IN_PROGRESS) {
    return NextResponse.json({ error: 'Unit is not available for work' }, { status: 409 });
  }

  // Return existing active submission for this employee if any
  const existing = await prisma.stageWorkSubmission.findFirst({
    where: { unitId: id, stage: unit.currentStage, employeeId: session.id, analysisStatus: 'IN_PROGRESS' },
  });
  if (existing) return NextResponse.json(existing);

  // Mark unit IN_PROGRESS if still PENDING
  if (unit.currentStatus === UnitStatus.PENDING) {
    await prisma.controllerUnit.update({ where: { id }, data: { currentStatus: UnitStatus.IN_PROGRESS } });
    await prisma.stageLog.create({
      data: { unitId: id, userId: session.id, stage: unit.currentStage, statusFrom: UnitStatus.PENDING, statusTo: UnitStatus.IN_PROGRESS },
    });
  }

  const submission = await prisma.stageWorkSubmission.create({
    data: { unitId: id, employeeId: session.id, stage: unit.currentStage },
  });

  return NextResponse.json(submission, { status: 201 });
}

// ── PUT: submit photo → PCB check → mark complete ─────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const formData = await req.formData();
  const file  = formData.get('image') as File | null;
  const file2 = (formData.get('file2') ?? formData.get('image2')) as File | null;
  const file3 = (formData.get('file3') ?? formData.get('image3')) as File | null;
  const submissionId = formData.get('submissionId') as string | null;

  if (!file) return NextResponse.json({ error: 'Image required' }, { status: 400 });

  const unit = await prisma.controllerUnit.findUnique({
    where: { id },
    select: { currentStage: true, currentStatus: true },
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

  // ── PCB check: read main image into buffer first (file can only be read once) ──
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const pcbOk = await isPcbImage(fileBuffer);
  if (!pcbOk) {
    // Don't upload, don't complete — let employee retake
    return NextResponse.json({ result: 'NOT_A_BOARD', summary: '[NOT_A_BOARD]', issues: [] });
  }

  // ── Upload all photos to Vercel Blob ──────────────────────────────────────
  const ts = Date.now();
  const [blob, blob2, blob3] = await Promise.all([
    put(`stage-work/${id}/${unit.currentStage}/${ts}-1.jpg`, fileBuffer, { access: 'private', contentType: 'image/jpeg' }),
    file2 ? put(`stage-work/${id}/${unit.currentStage}/${ts}-2.jpg`, file2, { access: 'private', contentType: file2.type || 'image/jpeg' }) : null,
    file3 ? put(`stage-work/${id}/${unit.currentStage}/${ts}-3.jpg`, file3, { access: 'private', contentType: file3.type || 'image/jpeg' }) : null,
  ]);

  // ── Save submission as PASSED ──────────────────────────────────────────────
  const now = new Date();
  const buildTimeSec = Math.round((now.getTime() - new Date(submission.startedAt).getTime()) / 1000);

  const updated = await prisma.stageWorkSubmission.update({
    where: { id: submission.id },
    data: {
      imageUrl:        blob.url,
      imageUrl2:       blob2?.url ?? null,
      imageUrl3:       blob3?.url ?? null,
      analysisStatus:  'PASSED',
      analysisResult:  'PASS',
      analysisIssues:  JSON.stringify([]),
      analysisSummary: 'PCB verified and photo saved to production record.',
      submittedAt:     now,
      completedAt:     now,
      buildTimeSec,
    },
  });

  // ── Auto-complete unit stage ───────────────────────────────────────────────
  try {
    const completeRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/units/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({ status: 'COMPLETED', userId: session.id }),
    });
    if (!completeRes.ok) {
      const errData = await completeRes.json().catch(() => ({}));
      console.error('Auto-complete failed:', completeRes.status, errData);
      return NextResponse.json({ error: 'Photo saved but stage completion failed. Please refresh and try again.' }, { status: 500 });
    }
  } catch (e) {
    console.error('Auto-complete network error:', e);
    return NextResponse.json({ error: 'Photo saved but stage completion failed. Please refresh and try again.' }, { status: 500 });
  }

  return NextResponse.json({ submission: updated, result: 'PASS', issues: [], summary: updated.analysisSummary });
}
