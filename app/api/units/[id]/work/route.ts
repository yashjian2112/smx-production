// GET  /api/units/[id]/work  — get active submission + history
// POST /api/units/[id]/work  — start work (record start time)
// PUT  /api/units/[id]/work  — submit photo (saved without analysis until hardware arrives)
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';
import { UnitStatus } from '@prisma/client';

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

  // Return existing active submission if any
  const existing = await prisma.stageWorkSubmission.findFirst({
    where: { unitId: id, stage: unit.currentStage, employeeId: session.id, analysisStatus: 'IN_PROGRESS' },
  });
  if (existing) return NextResponse.json(existing);

  // Mark unit IN_PROGRESS if still PENDING
  if (unit.currentStatus === 'PENDING') {
    await prisma.controllerUnit.update({ where: { id }, data: { currentStatus: 'IN_PROGRESS' } });
    await prisma.stageLog.create({
      data: { unitId: id, userId: session.id, stage: unit.currentStage, statusFrom: UnitStatus.PENDING, statusTo: UnitStatus.IN_PROGRESS },
    });
  }

  const submission = await prisma.stageWorkSubmission.create({
    data: { unitId: id, employeeId: session.id, stage: unit.currentStage },
  });

  return NextResponse.json(submission, { status: 201 });
}

// ── PUT: submit image (NO AI analysis until external hardware arrives) ────────
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

  // Upload photos to Vercel Blob (upload in parallel)
  const ts = Date.now();
  const [blob, blob2, blob3] = await Promise.all([
    put(`stage-work/${id}/${unit.currentStage}/${ts}-1.jpg`, file,  { access: 'private', contentType: file.type  || 'image/jpeg' }),
    file2 ? put(`stage-work/${id}/${unit.currentStage}/${ts}-2.jpg`, file2, { access: 'private', contentType: file2.type || 'image/jpeg' }) : null,
    file3 ? put(`stage-work/${id}/${unit.currentStage}/${ts}-3.jpg`, file3, { access: 'private', contentType: file3.type || 'image/jpeg' }) : null,
  ]);

  // Auto-pass submission — save photos without AI analysis
  // AI component inspection will be re-enabled when external hardware (RPi cameras) arrives
  const now = new Date();
  const buildTimeSec = Math.round((now.getTime() - new Date(submission.startedAt).getTime()) / 1000);

  const updated = await prisma.stageWorkSubmission.update({
    where: { id: submission.id },
    data: {
      imageUrl:  blob.url,
      imageUrl2: blob2?.url ?? null,
      imageUrl3: blob3?.url ?? null,
      analysisStatus:  'PASSED',
      analysisResult:  'PASS',
      analysisIssues:  JSON.stringify([]),
      analysisSummary: 'Photo saved to production record.',
      submittedAt:     now,
      completedAt:     now,
      buildTimeSec,
    },
  });

  // Auto-complete unit stage on successful photo submission
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
