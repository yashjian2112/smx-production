import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/inventory/job-cards/[id]/verify
// Employee confirms receipt of dispatched materials.
// Optional body: { note: "2 boards missing" }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  const { id } = await params;

  const jobCard = await prisma.jobCard.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          rawMaterial: { select: { id: true, name: true } },
        }
      }
    }
  });

  if (!jobCard) {
    return NextResponse.json({ error: 'Job card not found' }, { status: 404 });
  }

  if (jobCard.status !== 'DISPATCHED') {
    return NextResponse.json(
      { error: `Cannot verify — job card is ${jobCard.status}, expected DISPATCHED` },
      { status: 400 }
    );
  }

  // Parse optional note
  let note: string | null = null;
  try {
    const body = await req.json();
    if (body.note && typeof body.note === 'string' && body.note.trim()) {
      note = body.note.trim();
    }
  } catch {
    // no body is fine
  }

  // Mark all items as verified
  await prisma.jobCardItem.updateMany({
    where: { jobCardId: id },
    data: { isVerified: true, verifiedQty: undefined },
  });

  // For each item, set verifiedQty = quantityIssued
  for (const item of jobCard.items) {
    await prisma.jobCardItem.update({
      where: { id: item.id },
      data: { isVerified: true, verifiedQty: item.quantityIssued },
    });
  }

  // Update job card status
  const updated = await prisma.jobCard.update({
    where: { id },
    data: {
      status: 'VERIFIED',
      verifiedById: session.id,
      verifiedAt: new Date(),
      verifyNote: note,
    },
    include: {
      order: { select: { orderNumber: true } },
      verifiedBy: { select: { name: true } },
      items: {
        include: {
          rawMaterial: { select: { id: true, name: true, code: true, unit: true } }
        }
      }
    }
  });

  return NextResponse.json(updated);
}

// GET /api/inventory/job-cards/[id]/verify
// Returns job card with items for the verify modal
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireSession();
  const { id } = await params;

  const jobCard = await prisma.jobCard.findUnique({
    where: { id },
    include: {
      order: { select: { orderNumber: true, quantity: true } },
      items: {
        include: {
          rawMaterial: { select: { id: true, name: true, code: true, unit: true } }
        }
      }
    }
  });

  if (!jobCard) {
    return NextResponse.json({ error: 'Job card not found' }, { status: 404 });
  }

  return NextResponse.json(jobCard);
}
