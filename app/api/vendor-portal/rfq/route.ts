import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

const VENDOR_JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'smx-vendor-secret-change-in-prod'
);

async function getVendorSession(req: NextRequest) {
  const token = req.cookies.get('vendor_session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, VENDOR_JWT_SECRET);
    if (payload.type !== 'vendor') return null;
    return payload as { vendorId: string; vendorCode: string };
  } catch {
    return null;
  }
}

// GET /api/vendor-portal/rfq — vendor sees their open RFQs
export async function GET(req: NextRequest) {
  const vendor = await getVendorSession(req);
  if (!vendor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Also support token-based access for direct link
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  let rfqs;

  if (token) {
    // Single RFQ via invite token
    const invite = await prisma.rFQVendorInvite.findUnique({
      where: { token },
      include: {
        rfq: {
          include: {
            items: {
              include: { material: { select: { id: true, name: true, code: true, unit: true } } },
            },
          },
        },
      },
    });
    if (!invite || invite.vendorId !== vendor.vendorId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }
    // Mark viewed
    if (!invite.viewedAt) {
      await prisma.rFQVendorInvite.update({ where: { id: invite.id }, data: { viewedAt: new Date() } });
    }
    rfqs = [invite.rfq];
  } else {
    // All RFQs for this vendor
    const invites = await prisma.rFQVendorInvite.findMany({
      where: { vendorId: vendor.vendorId, rfq: { status: { in: ['OPEN', 'CLOSED'] } } },
      include: {
        rfq: {
          include: {
            items: {
              include: { material: { select: { id: true, name: true, code: true, unit: true } } },
            },
            quotes: {
              where: { vendorId: vendor.vendorId },
              select: { id: true, status: true, totalAmount: true, submittedAt: true },
            },
          },
        },
      },
      orderBy: { invitedAt: 'desc' },
    });
    rfqs = invites.map((i: { rfq: typeof invites[number]['rfq'] }) => ({ ...i.rfq, myQuote: (i.rfq as any).quotes?.[0] ?? null }));
  }

  return NextResponse.json(rfqs);
}
