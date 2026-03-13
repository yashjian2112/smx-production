import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifySheetToken } from '@/lib/sheet-auth';
import { appendTimeline } from '@/lib/timeline';

const Body = z.object({
  workOrderNumber:     z.string().min(1),          // WO-00015  — becomes orderNumber in SMX
  websiteOrderNumber:  z.string().optional(),       // 3523
  productCode:         z.string().optional(),       // "1000" — preferred lookup
  productDescription:  z.string().optional(),       // fallback fuzzy search
  quantity:            z.number().int().min(1),
  dueDate:             z.string().optional(),       // "DD/MM/YYYY" or ISO
  voltage:             z.string().optional(),       // "48V"
  motorType:           z.enum(['LBX', 'UBX']).optional(),
  priority:            z.number().int().default(0),
});

export async function POST(req: NextRequest) {
  if (!verifySheetToken(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { workOrderNumber, websiteOrderNumber, productCode, productDescription, quantity, dueDate, voltage, motorType, priority } = parsed.data;

  // ── Guard: duplicate order ───────────────────────────────────────────────
  const existing = await prisma.order.findUnique({ where: { orderNumber: workOrderNumber } });
  if (existing) {
    return NextResponse.json(
      { error: `Order ${workOrderNumber} already exists in SMX`, orderId: existing.id },
      { status: 409 },
    );
  }

  // ── Product lookup ───────────────────────────────────────────────────────
  let product = null;

  if (productCode) {
    product = await prisma.product.findFirst({
      where: { code: productCode, active: true },
    });
  }

  if (!product && productDescription) {
    // Fuzzy: strip numbers/punctuation, search by name
    product = await prisma.product.findFirst({
      where: {
        active: true,
        name: { contains: productDescription.replace(/[^a-zA-Z0-9\s]/g, '').trim(), mode: 'insensitive' },
      },
    });
  }

  if (!product) {
    // Return all available products so the script can suggest the right one
    const available = await prisma.product.findMany({ where: { active: true }, select: { code: true, name: true } });
    return NextResponse.json(
      { error: 'Product not found. Use productCode field.', available },
      { status: 404 },
    );
  }

  // ── Parse due date ───────────────────────────────────────────────────────
  let dueDateParsed: Date | undefined;
  if (dueDate) {
    // Handle DD/MM/YYYY or ISO
    const parts = dueDate.split('/');
    if (parts.length === 3) {
      dueDateParsed = new Date(`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`);
    } else {
      dueDateParsed = new Date(dueDate);
    }
    if (isNaN(dueDateParsed.getTime())) dueDateParsed = undefined;
  }

  // ── Create order ─────────────────────────────────────────────────────────
  const order = await prisma.order.create({
    data: {
      orderNumber: workOrderNumber,
      productId:   product.id,
      quantity,
      dueDate:     dueDateParsed,
      voltage:     voltage ?? undefined,
      motorType:   motorType ?? undefined,
      priority:    priority ?? 0,
      status:      'ACTIVE',
    },
  });

  // ── Timeline log ─────────────────────────────────────────────────────────
  await appendTimeline({
    orderId: order.id,
    action:  'order_created',
    remarks: `Punched from Google Sheet — WO: ${workOrderNumber}${websiteOrderNumber ? ` | Web: ${websiteOrderNumber}` : ''}`,
  });

  return NextResponse.json({
    ok:          true,
    orderId:     order.id,
    orderNumber: order.orderNumber,
    productName: product.name,
    productCode: product.code,
    quantity,
  });
}
