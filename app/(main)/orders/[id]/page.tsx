import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { OrderDetail, type StageGroup } from './OrderDetail';

const STAGE_CONFIG: { key: string; label: string }[] = [
  { key: 'POWERSTAGE_MANUFACTURING', label: 'Powerstage' },
  { key: 'BRAINBOARD_MANUFACTURING', label: 'Brainboard' },
  { key: 'CONTROLLER_ASSEMBLY',      label: 'Assembly' },
  { key: 'QC_AND_SOFTWARE',          label: 'QC & Software' },
  { key: 'FINAL_ASSEMBLY',           label: 'Final Assembly' },
  { key: 'REWORK',                   label: 'Rework' },
];

// Ordered pipeline (REWORK is a side-branch, not in the main sequence)
const STAGE_PIPELINE = [
  'POWERSTAGE_MANUFACTURING',
  'BRAINBOARD_MANUFACTURING',
  'CONTROLLER_ASSEMBLY',
  'QC_AND_SOFTWARE',
  'FINAL_ASSEMBLY',
];

// Which DB barcode field corresponds to each stage
const STAGE_BARCODE_FIELD: Record<string, 'powerstageBarcode' | 'brainboardBarcode' | 'qcBarcode' | 'finalAssemblyBarcode' | null> = {
  POWERSTAGE_MANUFACTURING: 'powerstageBarcode',
  BRAINBOARD_MANUFACTURING: 'brainboardBarcode',
  CONTROLLER_ASSEMBLY:      null,
  QC_AND_SOFTWARE:          'qcBarcode',
  FINAL_ASSEMBLY:           'finalAssemblyBarcode',
  REWORK:                   null,
};

type UnitRow = {
  id: string;
  serialNumber: string;
  currentStage: string;
  currentStatus: string;
  powerstageBarcode: string | null;
  brainboardBarcode: string | null;
  qcBarcode: string | null;
  finalAssemblyBarcode: string | null;
};

/**
 * Derive what status a unit has AT a given stage — even if it has already moved past it.
 *   COMPLETED  → unit has passed through this stage
 *   <actual>   → unit is currently at this stage (IN_PROGRESS / PENDING / etc.)
 *   PENDING    → unit hasn't reached this stage yet
 *   BLOCKED    → unit is in REWORK (blocked from all normal stages)
 */
function derivedStageStatus(unit: UnitRow, stageKey: string): string {
  if (unit.currentStage === 'REWORK') {
    return stageKey === 'REWORK' ? unit.currentStatus : 'BLOCKED';
  }
  if (stageKey === 'REWORK') return 'PENDING';

  const curIdx = STAGE_PIPELINE.indexOf(unit.currentStage);
  const tarIdx = STAGE_PIPELINE.indexOf(stageKey);

  if (curIdx < 0 || tarIdx < 0) return unit.currentStatus;
  if (tarIdx < curIdx) return 'COMPLETED';          // already passed this stage
  if (tarIdx === curIdx) return unit.currentStatus;  // currently here
  return 'PENDING';                                  // not yet reached
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const isEmployee = session.role === 'PRODUCTION_EMPLOYEE';

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      product: true,
      units: {
        select: {
          id: true,
          serialNumber: true,
          currentStage: true,
          currentStatus: true,
          powerstageBarcode: true,
          brainboardBarcode: true,
          qcBarcode: true,
          finalAssemblyBarcode: true,
        },
        orderBy: { serialNumber: 'asc' },
      },
    },
  });
  if (!order) notFound();

  /**
   * Each stage shows ALL units (not just the ones currently there).
   * Each unit in a stage has:
   *   barcodeForStage — the physical label/QR value for that station
   *   derivedStatus   — reflects progress relative to pipeline position
   *
   * REWORK stage is the only exception: shows only units currently in rework.
   */
  const stages: StageGroup[] = STAGE_CONFIG.map(({ key, label }) => {
    const unitsForStage =
      key === 'REWORK'
        ? order.units.filter((u) => u.currentStage === 'REWORK')
        : order.units;

    return {
      key,
      label,
      units: unitsForStage.map((u) => {
        const field = STAGE_BARCODE_FIELD[key];
        // For FA, only show the barcode if the unit has actually reached or completed FA
        const unitAtOrPastStage =
          key !== 'FINAL_ASSEMBLY' ||
          STAGE_PIPELINE.indexOf(u.currentStage) >= STAGE_PIPELINE.indexOf('FINAL_ASSEMBLY');
        return {
          id: u.id,
          serialNumber: u.serialNumber,
          currentStage: u.currentStage,
          currentStatus: u.currentStatus,
          barcodeForStage: field && unitAtOrPastStage ? (u[field] ?? null) : null,
          derivedStatus: derivedStageStatus(u, key),
          // Pass PS + BB barcodes for Assembly multi-select modal
          powerstageBarcode: key === 'CONTROLLER_ASSEMBLY' ? (u.powerstageBarcode ?? null) : undefined,
          brainboardBarcode: key === 'CONTROLLER_ASSEMBLY' ? (u.brainboardBarcode ?? null) : undefined,
        };
      }),
    };
  });

  const total      = order.units.length;
  const completed  = order.units.filter((u) => u.currentStatus === 'COMPLETED').length;
  const inProgress = order.units.filter((u) => u.currentStatus === 'IN_PROGRESS').length;
  const blocked    = order.units.filter((u) => u.currentStatus === 'BLOCKED').length;
  const pct        = total > 0 ? Math.round((completed / total) * 100) : 0;

  const isNew = Date.now() - order.createdAt.getTime() < 24 * 60 * 60 * 1000;

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Orders
      </Link>

      {/* Order header card */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-mono font-bold text-lg">{order.orderNumber}</h2>
            {isNew && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(56,189,248,0.2)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}
              >
                NEW
              </span>
            )}
          </div>
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
              order.status === 'ACTIVE' ? 'text-green-400' : 'text-zinc-500'
            }`}
            style={
              order.status === 'ACTIVE'
                ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
            }
          >
            {order.status}
          </span>
        </div>

        <p className="text-zinc-400 text-sm">
          {order.product.name}
          {order.voltage ? ` · ${order.voltage}` : ''}
        </p>

        {order.dueDate && (
          <p className="text-zinc-600 text-xs mt-1">
            Due: {new Date(order.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}

        {/* Progress summary */}
        <div className="mt-4">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center">
              <p className="text-xl font-bold text-white">{total}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Total</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-green-400">{completed}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Done</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-amber-400">{inProgress}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Active</p>
            </div>
          </div>
          {blocked > 0 && (
            <p className="text-xs text-red-400 text-center mb-2">⚠ {blocked} unit{blocked !== 1 ? 's' : ''} blocked</p>
          )}
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background:
                  pct === 100
                    ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                    : pct > 50
                    ? 'linear-gradient(90deg,#38bdf8,#0ea5e9)'
                    : 'linear-gradient(90deg,#6366f1,#38bdf8)',
              }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-zinc-600 mt-1">
            <span>Order progress</span>
            <span className={pct === 100 ? 'text-green-400 font-semibold' : ''}>{pct}%</span>
          </div>
        </div>
      </div>

      {/* Employee instruction */}
      {isEmployee && (
        <div
          className="rounded-xl p-3 flex items-start gap-3"
          style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}
        >
          <svg className="text-sky-400 shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" /><path d="M14 14h.01M18 14h.01M14 18h.01M18 18h.01M21 14v4M14 21h4" />
          </svg>
          <div>
            <p className="text-sky-400 text-xs font-semibold">Scan to start working</p>
            <p className="text-zinc-500 text-xs mt-0.5">
              Pick up a physical unit, scan its barcode below to reveal it, then tap it to open your work page.
            </p>
          </div>
        </div>
      )}

      {/* Stage breakdown */}
      <OrderDetail orderId={order.id} stages={stages} isEmployee={isEmployee} totalUnits={total} />
    </div>
  );
}
