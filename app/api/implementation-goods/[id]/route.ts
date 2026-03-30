import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getFiscalYear } from '@/lib/invoice-number';

const IG_SELECT = {
  id: true,
  igNumber: true,
  status: true,
  description: true,
  items: true,
  purpose: true,
  notes: true,
  expectedArrival: true,
  expectedReturn: true,
  ganDate: true,
  ganNotes: true,
  courierDetails: true,
  grnDate: true,
  grnNotes: true,
  warehouseLocation: true,
  returnInitiatedAt: true,
  dnNumber: true,
  boxCount: true,
  dispatchedAt: true,
  dispatchCourier: true,
  trackingNumber: true,
  closedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, code: true, customerName: true } },
  createdBy: { select: { id: true, name: true } },
  ganBy: { select: { id: true, name: true } },
  grnBy: { select: { id: true, name: true } },
  timeline: {
    select: {
      id: true,
      status: true,
      action: true,
      notes: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  boxes: {
    select: {
      id: true,
      boxNumber: true,
      label: true,
      items: true,
      isSealed: true,
      photoUrl: true,
    },
    orderBy: { boxNumber: 'asc' as const },
  },
};

// ────── GET: detail with timeline + boxes ──────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    const allowed = ['ADMIN', 'SALES', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTS', 'PACKING', 'PRODUCTION_EMPLOYEE'];
    if (!allowed.includes(session.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const ig = await prisma.implementationGood.findUnique({
      where: { id: params.id },
      select: IG_SELECT,
    });
    if (!ig) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // SALES can only see own
    if (session.role === 'SALES' && ig.createdBy.id !== session.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    return NextResponse.json(ig);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ────── PATCH: status transitions ──────
// Each transition is role-gated:
//   REQUESTED → GAN_CREATED   (PURCHASE_MANAGER)
//   REQUESTED → REJECTED      (PURCHASE_MANAGER)
//   GAN_CREATED → RECEIVED    (STORE_MANAGER)
//   RECEIVED → IN_USE         (STORE_MANAGER)
//   IN_USE → IN_STORE         (STORE_MANAGER)
//   IN_STORE → IN_USE         (STORE_MANAGER)  — re-issue
//   IN_STORE → RETURN_INITIATED (SALES)
//   RECEIVED → RETURN_INITIATED (SALES)
//   RETURN_INITIATED → PACKING (PACKING / PRODUCTION_EMPLOYEE)
//   PACKED → DISPATCHED       (ACCOUNTS)
//   DISPATCHED → CLOSED       (SALES)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const { action } = body;

    if (!action || typeof action !== 'string')
      return NextResponse.json({ error: 'action is required' }, { status: 400 });

    const ig = await prisma.implementationGood.findUnique({
      where: { id: params.id },
      select: { id: true, igNumber: true, status: true },
    });
    if (!ig) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    let newStatus: string = ig.status;
    let timelineAction = '';

    switch (action) {
      // ── Purchase Manager creates GAN ──
      case 'gan': {
        if (!['PURCHASE_MANAGER', 'ADMIN'].includes(session.role))
          return NextResponse.json({ error: 'Only Purchase Manager can create GAN' }, { status: 403 });
        if (ig.status !== 'REQUESTED')
          return NextResponse.json({ error: 'IG must be in REQUESTED status' }, { status: 400 });

        const { ganNotes, courierDetails } = body;
        newStatus = 'GAN_CREATED';
        updateData.status = newStatus;
        updateData.ganDate = new Date();
        updateData.ganNotes = ganNotes || null;
        updateData.courierDetails = courierDetails || null;
        updateData.ganById = session.id;
        timelineAction = 'GAN logged — goods arrived';
        break;
      }

      // ── Purchase Manager rejects ──
      case 'reject': {
        if (!['PURCHASE_MANAGER', 'ADMIN'].includes(session.role))
          return NextResponse.json({ error: 'Only Purchase Manager can reject' }, { status: 403 });
        if (ig.status !== 'REQUESTED')
          return NextResponse.json({ error: 'Can only reject REQUESTED items' }, { status: 400 });

        const { reason } = body;
        newStatus = 'REJECTED';
        updateData.status = newStatus;
        updateData.rejectedAt = new Date();
        updateData.rejectionReason = reason || null;
        timelineAction = `Rejected${reason ? ': ' + reason : ''}`;
        break;
      }

      // ── Store Manager does GRN ──
      case 'grn': {
        if (!['INVENTORY_MANAGER', 'ADMIN'].includes(session.role))
          return NextResponse.json({ error: 'Only Store Manager can do GRN' }, { status: 403 });
        if (ig.status !== 'GAN_CREATED')
          return NextResponse.json({ error: 'GAN must be created first' }, { status: 400 });

        const { grnNotes, warehouseLocation } = body;
        newStatus = 'RECEIVED';
        updateData.status = newStatus;
        updateData.grnDate = new Date();
        updateData.grnNotes = grnNotes || null;
        updateData.warehouseLocation = warehouseLocation || null;
        updateData.grnById = session.id;
        timelineAction = `GRN completed${warehouseLocation ? ' — stored at ' + warehouseLocation : ''}`;
        break;
      }

      // ── Store Manager issues (IN_USE) ──
      case 'issue': {
        if (!['INVENTORY_MANAGER', 'ADMIN'].includes(session.role))
          return NextResponse.json({ error: 'Only Store Manager can issue' }, { status: 403 });
        if (!['RECEIVED', 'IN_STORE'].includes(ig.status))
          return NextResponse.json({ error: 'Must be RECEIVED or IN_STORE to issue' }, { status: 400 });

        const { issueNotes } = body;
        newStatus = 'IN_USE';
        updateData.status = newStatus;
        timelineAction = `Issued for use${issueNotes ? ' — ' + issueNotes : ''}`;
        break;
      }

      // ── Store Manager receives back (IN_STORE) ──
      case 'return_to_store': {
        if (!['INVENTORY_MANAGER', 'ADMIN'].includes(session.role))
          return NextResponse.json({ error: 'Only Store Manager can receive back' }, { status: 403 });
        if (ig.status !== 'IN_USE')
          return NextResponse.json({ error: 'Must be IN_USE to return to store' }, { status: 400 });

        const { conditionNotes } = body;
        newStatus = 'IN_STORE';
        updateData.status = newStatus;
        timelineAction = `Returned to store${conditionNotes ? ' — ' + conditionNotes : ''}`;
        break;
      }

      // ── Sales initiates return ──
      case 'return_initiate': {
        if (!['SALES', 'ADMIN'].includes(session.role))
          return NextResponse.json({ error: 'Only Sales can initiate return' }, { status: 403 });
        if (!['IN_STORE', 'RECEIVED'].includes(ig.status))
          return NextResponse.json({ error: 'Must be IN_STORE or RECEIVED to initiate return' }, { status: 400 });

        newStatus = 'RETURN_INITIATED';
        updateData.status = newStatus;
        updateData.returnInitiatedAt = new Date();
        timelineAction = 'Return initiated — ready for packing';
        break;
      }

      // ── Packing starts ──
      case 'start_packing': {
        if (!['PACKING', 'PRODUCTION_EMPLOYEE', 'ADMIN'].includes(session.role))
          return NextResponse.json({ error: 'Only Packing team can start packing' }, { status: 403 });
        if (ig.status !== 'RETURN_INITIATED')
          return NextResponse.json({ error: 'Return must be initiated first' }, { status: 400 });

        const { boxCount } = body;
        if (!boxCount || typeof boxCount !== 'number' || boxCount < 1)
          return NextResponse.json({ error: 'boxCount must be >= 1' }, { status: 400 });

        // Generate DN number
        const fy = getFiscalYear();
        const dnPrefix = `DN/IG/${fy}/`;
        const latestDN = await prisma.implementationGood.findFirst({
          where: { dnNumber: { startsWith: dnPrefix } },
          orderBy: { dnNumber: 'desc' },
          select: { dnNumber: true },
        });
        let dnSeq = 1;
        if (latestDN?.dnNumber) {
          const parts = latestDN.dnNumber.split('/');
          const s = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(s)) dnSeq = s + 1;
        }
        const dnNumber = `${dnPrefix}${String(dnSeq).padStart(3, '0')}`;

        newStatus = 'PACKING';
        updateData.status = newStatus;
        updateData.boxCount = boxCount;
        updateData.dnNumber = dnNumber;

        // Create packing box records
        const boxLabels = [];
        for (let i = 1; i <= boxCount; i++) {
          boxLabels.push({
            igId: ig.id,
            boxNumber: i,
            label: `${dnNumber}-BOX-${i}of${boxCount}`,
          });
        }
        await prisma.iGPackingBox.createMany({ data: boxLabels });

        timelineAction = `Packing started — ${boxCount} box(es), DN: ${dnNumber}`;
        break;
      }

      // ── Accounts dispatches (approves packing list) ──
      case 'dispatch': {
        if (!['ACCOUNTS', 'ADMIN'].includes(session.role))
          return NextResponse.json({ error: 'Only Accounts can dispatch' }, { status: 403 });
        if (ig.status !== 'PACKED')
          return NextResponse.json({ error: 'Must be PACKED to dispatch' }, { status: 400 });

        const { dispatchCourier, trackingNumber: tracking } = body;
        newStatus = 'DISPATCHED';
        updateData.status = newStatus;
        updateData.dispatchedAt = new Date();
        updateData.dispatchCourier = dispatchCourier || null;
        updateData.trackingNumber = tracking || null;
        timelineAction = `Dispatched${tracking ? ' — Tracking: ' + tracking : ''}`;
        break;
      }

      // ── Sales confirms customer receipt ──
      case 'close': {
        if (!['SALES', 'ADMIN'].includes(session.role))
          return NextResponse.json({ error: 'Only Sales can close' }, { status: 403 });
        if (ig.status !== 'DISPATCHED')
          return NextResponse.json({ error: 'Must be DISPATCHED to close' }, { status: 400 });

        const { closeNotes } = body;
        newStatus = 'CLOSED';
        updateData.status = newStatus;
        updateData.closedAt = new Date();
        timelineAction = `Closed — customer confirmed receipt${closeNotes ? '. ' + closeNotes : ''}`;
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Apply the update + create timeline entry
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.implementationGood.update({
        where: { id: ig.id },
        data: updateData,
        select: {
          id: true,
          igNumber: true,
          status: true,
          dnNumber: true,
        },
      });

      await tx.iGTimeline.create({
        data: {
          igId: ig.id,
          status: newStatus,
          action: timelineAction,
          notes: body.notes || body.ganNotes || body.grnNotes || body.reason || null,
          userId: session.id,
        },
      });

      return result;
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
