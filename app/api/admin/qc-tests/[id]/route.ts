import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH /api/admin/qc-tests/[id]
// Update a QC test item and optionally replace its params
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  requireRole(session, 'ADMIN');

  const { id } = await params;
  const body = await req.json();
  const { name, sortOrder, requirePhoto, aiExtract, active, params: newParams } = body;

  const existing = await prisma.qCTestItem.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'QC test item not found' }, { status: 404 });
  }

  // Update the test item
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
  if (requirePhoto !== undefined) updateData.requirePhoto = requirePhoto;
  if (aiExtract !== undefined) updateData.aiExtract = aiExtract;
  if (active !== undefined) updateData.active = active;

  // If params are provided, delete old and recreate (full replace)
  if (newParams !== undefined) {
    await prisma.$transaction(async (tx) => {
      await tx.qCTestParam.deleteMany({ where: { testItemId: id } });
      await tx.qCTestItem.update({ where: { id }, data: updateData });
      for (let i = 0; i < newParams.length; i++) {
        const p = newParams[i];
        await tx.qCTestParam.create({
          data: {
            testItemId: id,
            name: p.name,
            label: p.label || null,
            unit: p.unit || null,
            minValue: p.minValue != null ? Number(p.minValue) : null,
            maxValue: p.maxValue != null ? Number(p.maxValue) : null,
            matchTolerance: p.matchTolerance != null ? Number(p.matchTolerance) : null,
            matchParamId: p.matchParamId || null,
            isWriteParam: p.isWriteParam ?? false,
            hardBlock: p.hardBlock ?? false,
            sortOrder: p.sortOrder ?? i,
          },
        });
      }
    });
  } else {
    await prisma.qCTestItem.update({ where: { id }, data: updateData });
  }

  const updated = await prisma.qCTestItem.findUnique({
    where: { id },
    include: { params: { orderBy: { sortOrder: 'asc' } } },
  });

  return NextResponse.json(updated);
}

// DELETE /api/admin/qc-tests/[id]
// Soft-delete (set active=false)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  requireRole(session, 'ADMIN');

  const { id } = await params;
  await prisma.qCTestItem.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ ok: true });
}
