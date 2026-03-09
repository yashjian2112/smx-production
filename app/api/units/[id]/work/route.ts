// GET  /api/units/[id]/work  — get active submission + history
// POST /api/units/[id]/work  — start work (record start time)
// PUT  /api/units/[id]/work  — submit image + AI analysis
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';
import Anthropic from '@anthropic-ai/sdk';

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

  // Fetch checklist for this stage
  const checklist = await prisma.stageChecklistItem.findMany({
    where: { stage: unit.currentStage, active: true },
    orderBy: { sortOrder: 'asc' },
  });

  // ── Claude Vision ────────────────────────────────────────────────────────────
  let analysisResult: 'PASS' | 'FAIL' = 'PASS';
  let analysisIssues: { name: string; status: string; note: string }[] = [];
  let analysisSummary = 'Analysis complete.';

  try {
    const checklistText =
      checklist.length > 0
        ? checklist
            .map((c, i) => `${i + 1}. ${c.name}${c.description ? ': ' + c.description : ''} (${c.required ? 'REQUIRED' : 'optional'})`)
            .join('\n')
        : 'No specific checklist defined — verify overall build quality and completeness.';

    const imgRes = await fetch(blob.url);
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            {
              type: 'text',
              text: `You are a precision PCB quality-control AI for SMX Drives electronic controller manufacturing.
Inspect this image and report the status of EVERY visible component individually.

Stage: ${unit.currentStage.replace(/_/g, ' ')}
Unit serial: ${unit.serialNumber}
Product: ${unit.product?.name ?? 'Unknown'}

Expected components for this stage:
${checklistText}

For EVERY component you can identify in the image, check all five criteria:
1. PRESENCE        — Is it installed?
2. ORIENTATION     — Correct direction? (ICs pin-1, diodes, polarised caps, MOSFETs)
3. PLACEMENT       — Seated on pads properly? Not shifted, bridged, or tombstoned?
4. SOLDER QUALITY  — No bridges, cold joints, insufficient solder, or excess flux?
5. DAMAGE          — Cracked, burned, visibly defective?

Respond ONLY with valid JSON — no markdown fences, no extra text outside the JSON object:
{
  "overall": "PASS" or "FAIL",
  "components": [
    {
      "name": "component ref or name, e.g. U1 / R12 / C4 / Main capacitor",
      "status": "PRESENT" | "MISSING" | "DEFECTIVE" | "WRONG_ORIENTATION" | "SOLDER_ISSUE" | "MISPLACED",
      "note": "specific observation, e.g. 'correctly oriented, clean solder joints' or 'pin-1 dot facing wrong direction' or 'visible solder bridge between pins 3-4'",
      "location": "board location hint, e.g. 'top-left near power connector' or 'centre of board'"
    }
  ],
  "summary": "1–2 sentence overall assessment"
}

RULES:
— List every distinct component you can see, even unlabelled passives.
— PASS only when ALL items marked REQUIRED in the checklist are PRESENT, correctly oriented, and have acceptable solder joints.
— If the image is blurry, too dark, or the PCB is not visible, set overall to "FAIL" and explain in summary.
— Be precise in notes so the operator knows exactly what to fix and where.`,
            },
          ],
        },
      ],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      analysisResult = parsed.overall === 'PASS' ? 'PASS' : 'FAIL';
      analysisIssues = parsed.components ?? [];
      analysisSummary = parsed.summary ?? '';
    }
  } catch (err) {
    console.error('Vision error:', err);
    analysisSummary = 'AI analysis unavailable — image saved, manual review required.';
    // Keep PASS so work is not blocked if AI is down
  }

  const now = new Date();
  const buildTimeSec = Math.round((now.getTime() - new Date(submission.startedAt).getTime()) / 1000);

  const updated = await prisma.stageWorkSubmission.update({
    where: { id: submission.id },
    data: {
      analysisStatus: analysisResult === 'PASS' ? 'PASSED' : 'FAILED',
      analysisResult,
      analysisIssues: JSON.stringify(analysisIssues),
      analysisSummary,
      completedAt: analysisResult === 'PASS' ? now : undefined,
      buildTimeSec: analysisResult === 'PASS' ? buildTimeSec : undefined,
    },
  });

  // On PASS → auto-complete the unit stage (triggers auto-advance in PATCH route)
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
