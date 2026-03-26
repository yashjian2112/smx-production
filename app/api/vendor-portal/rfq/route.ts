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
  const { searchParams } = new URL(req.url);
  const inviteToken = searchParams.get('token');

  let rfqs;

  if (inviteToken) {
    // Token-based: vendor accessed via direct link (no session required)
    const invite = await prisma.rFQVendorInvite.findUnique({
      where: { token: inviteToken },
      include: {
        rfq: {
          include: {
            items: {
              include: { material: { select: { id: true, name: true, code: true, unit: true } } },
            },
            quotes: {
              select: { id: true, status: true, totalAmount: true, submittedAt: true, vendorId: true },
            },
          },
        },
      },
    });
    if (!invite) {
      return NextResponse.json({ error: 'Invalid or expired invite token' }, { status: 403 });
    }
    // Mark viewed
    if (!invite.viewedAt) {
      await prisma.rFQVendorInvite.update({ where: { id: invite.id }, data: { viewedAt: new Date() } });
    }
    const myQuote = (invite.rfq as any).quotes?.find((q: { vendorId: string }) => q.vendorId === invite.vendorId) ?? null;
    rfqs = [{ ...invite.rfq, inviteToken: invite.token, myQuote }];
  } else {
    // Session-based: vendor logged in via dashboard
    const vendor = await getVendorSession(req);
    if (!vendor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Fetch vendor's categories to filter RFQs
    const vendorRecord = await prisma.vendor.findUnique({
      where: { id: vendor.vendorId },
      select: { categories: true },
    });
    const vendorCategories = vendorRecord?.categories ?? [];

    // All RFQs for this vendor — only those matching vendor's categories
    const invites = await prisma.rFQVendorInvite.findMany({
      where: {
        vendorId: vendor.vendorId,
        rfq: {
          status: { in: ['OPEN', 'CLOSED'] },
          // Show RFQ if: no category set (all vendors), OR category matches vendor's list
          OR: [
            { category: null },
            { category: { in: vendorCategories.length > 0 ? vendorCategories : ['__no_match__'] } },
          ],
        },
      },
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
    rfqs = invites.map((i: typeof invites[number]) => ({
      ...i.rfq,
      inviteToken: i.token,
      myQuote: (i.rfq as any).quotes?.[0] ?? null,
    }));
  }

  return NextResponse.json(rfqs);
}
