import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { UnitActions } from './UnitActions';
import { QcReportPrint } from './QcReportPrint';
import { QRCodeCanvas } from '@/components/QRCode';
import { Barcode128 } from '@/components/Barcode128';
import { ComponentChecklist } from './ComponentChecklist';
import { WorkTabs } from './WorkTabs';
import { QcChecklist } from './QcChecklist';
import { DispatchSection } from './DispatchSection';

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;

  const unit = await prisma.controllerUnit.findUnique({
    where: { id },
    include: {
      order: { include: { product: true } },
      product: { include: { components: { where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } } },
      assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      stageLogs: { include: { user: true, approvedBy: true }, orderBy: { createdAt: 'desc' }, take: 20 },
      qcRecords: { include: { issueCategory: true }, orderBy: { createdAt: 'desc' } },
      reworkRecords: { include: { rootCauseCategory: true, assignedUser: true, returnRequest: { select: { id: true, returnNumber: true } } }, orderBy: { createdAt: 'desc' } },
      timelineLogs: { include: { user: true }, orderBy: { createdAt: 'desc' } },
      componentChecks: {
        include: { component: true, checker: { select: { id: true, name: true } } },
      },
      workSubmissions: {
        select: { stage: true, employeeId: true, buildTimeSec: true, submittedAt: true },
        orderBy: { submittedAt: 'asc' },
      },
      linkedReturnRequest: {
        select: { id: true, returnNumber: true, reportedIssue: true, faultType: true, status: true },
      },
      returnRequests: {
        select: { id: true, returnNumber: true, reportedIssue: true, faultType: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!unit) notFound();

  const statusColors: Record<string, string> = {
    PENDING: 'text-zinc-400',
    IN_PROGRESS: 'text-amber-400',
    COMPLETED: 'text-green-400',
    APPROVED: 'text-green-300',
    BLOCKED: 'text-red-400',
  };
  const statusLabels: Record<string, string> = {
    BLOCKED: 'QC FAIL',
  };
  const stageLabels: Record<string, string> = {
    POWERSTAGE_MANUFACTURING: 'Powerstage',
    BRAINBOARD_MANUFACTURING: 'Brainboard',
    CONTROLLER_ASSEMBLY: 'Assembly',
    QC_AND_SOFTWARE: 'QC & Software',
    REWORK: 'Rework',
    FINAL_ASSEMBLY: 'Final Assembly',
  };

  const stageBarcodes = [
    { label: 'Powerstage',     value: unit.powerstageBarcode,                        isFinal: false },
    { label: 'Brainboard',     value: unit.brainboardBarcode,                        isFinal: false },
    { label: 'QC',             value: unit.qcBarcode,                                isFinal: false },
    { label: 'Final Assembly', value: unit.finalAssemblyBarcode ?? unit.serialNumber, isFinal: true  },
  ];

  // Stage barcode for the current stage — passed to StageWorkFlow for scan validation
  const stageBarcodeMap: Record<string, string | null> = {
    POWERSTAGE_MANUFACTURING: unit.powerstageBarcode ?? null,
    BRAINBOARD_MANUFACTURING: unit.brainboardBarcode ?? null,
    QC_AND_SOFTWARE:          unit.qcBarcode ?? null,
    FINAL_ASSEMBLY:           unit.finalAssemblyBarcode ?? null,
    CONTROLLER_ASSEMBLY:      null,
    REWORK:                   null,
  };
  const currentStageBarcode = stageBarcodeMap[unit.currentStage] ?? null;

  const isEmployee = session.role === 'PRODUCTION_EMPLOYEE';
  const canDoQC = ['ADMIN', 'PRODUCTION_MANAGER', 'QC_USER'].includes(session.role);
  const components = unit.product?.components ?? [];
  const initialChecks = unit.componentChecks.map((cc) => ({
    componentId: cc.componentId,
    checked: cc.checked,
    scannedValue: cc.scannedValue,
    checker: cc.checker,
    checkedAt: cc.checkedAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-2">
        <Link href="/orders" className="text-zinc-500 hover:text-white text-sm">← Orders</Link>
      </div>

      {/* Unit header */}
      <div className="card p-4">
        <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Serial</p>
        <p className="font-mono text-xl text-sky-400">{unit.serialNumber}</p>
        <p className="text-zinc-500 text-sm mt-2">Order {unit.order?.orderNumber} · {unit.product?.name}</p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[unit.currentStatus] ?? 'text-zinc-400'}`}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {statusLabels[unit.currentStatus] ?? unit.currentStatus.replace(/_/g, ' ')}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium text-zinc-400"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {stageLabels[unit.currentStage] ?? unit.currentStage}
          </span>
          {unit.reworkRecords.length > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
              style={{ color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
              Rework
            </span>
          )}
          {(() => {
            const assigned = unit.assignments.find(a => a.stage === unit.currentStage);
            if (!assigned) return null;
            return (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium text-violet-400"
                style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                {assigned.user.name}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Rework / Replacement Tracking */}
      {(() => {
        // Collect all return requests linked to this unit (direct + via returnRequestId)
        const allReturns = [
          ...(unit.linkedReturnRequest ? [unit.linkedReturnRequest] : []),
          ...unit.returnRequests,
        ].filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i); // deduplicate

        if (allReturns.length === 0) return null;

        return (
          <div className="card p-4 space-y-3">
            <h3 className="font-medium text-sm">Rework / Replacement</h3>
            {allReturns.map(ret => (
              <Link key={ret.id} href={`/rework/${ret.id}`}
                className="block rounded-xl p-3 transition-colors hover:bg-white/[0.03]"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
                    style={unit.linkedReturnRequest?.id === ret.id
                      ? { color: '#818cf8', background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.25)' }
                      : { color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }
                    }>
                    {unit.linkedReturnRequest?.id === ret.id ? 'Replacement' : 'Rework'}
                  </span>
                  <span className="font-mono text-xs text-sky-400">{ret.returnNumber}</span>
                  {ret.faultType && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={ret.faultType === 'MANUFACTURING_DEFECT'
                        ? { color: '#f87171', background: 'rgba(239,68,68,0.1)' }
                        : { color: '#fbbf24', background: 'rgba(251,191,36,0.1)' }
                      }>
                      {ret.faultType === 'MANUFACTURING_DEFECT' ? 'Mfg Defect' : 'Customer Damage'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 line-clamp-2">{ret.reportedIssue}</p>
                <p className="text-[10px] text-zinc-600 mt-1">Status: {ret.status.replace(/_/g, ' ')}</p>
              </Link>
            ))}
          </div>
        );
      })()}

      {/* Build Team — who worked on each stage */}
      {unit.assignments.length > 0 && (
        <div className="card p-4">
          <h3 className="font-medium text-sm mb-3">Build Team</h3>
          <div className="space-y-3">
            {(['POWERSTAGE_MANUFACTURING','BRAINBOARD_MANUFACTURING','CONTROLLER_ASSEMBLY','QC_AND_SOFTWARE','FINAL_ASSEMBLY','REWORK'] as const)
              .map((stage) => {
                const assignment = unit.assignments.find((a) => a.stage === stage);
                if (!assignment) return null;
                const submission = unit.workSubmissions.find(
                  (w) => w.stage === stage && w.employeeId === assignment.userId
                );
                const buildMins = submission?.buildTimeSec ? Math.round(submission.buildTimeSec / 60) : null;
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{stageLabels[stage] ?? stage}</p>
                      <p className="text-sm font-medium text-zinc-200">{assignment.user.name}</p>
                    </div>
                    {buildMins !== null && (
                      <span className="text-xs text-zinc-600 shrink-0">{buildMins} min</span>
                    )}
                  </div>
                );
              })
              .filter(Boolean)}
          </div>
        </div>
      )}

      {/* Stage barcodes — hidden for employees, they don't need to see these */}
      {!isEmployee && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">Stage Barcodes</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {stageBarcodes.map(({ label, value, isFinal }) => (
              <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {value ? (
                  isFinal
                    ? <Barcode128 value={value} height={50} fontSize={10} background="transparent" lineColor="#e2e8f0" />
                    : <QRCodeCanvas value={value} size={80} dark="#e2e8f0" light="transparent" />
                ) : (
                  <div className="w-20 h-20 rounded flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <span className="text-zinc-700 text-xs">N/A</span>
                  </div>
                )}
                <div className="text-center">
                  <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">{label}</p>
                  <p className="font-mono text-xs text-zinc-400 mt-0.5">{value ?? '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Component checklist — shown to admins/managers only; AI handles visual check for employees */}
      {!isEmployee && components.length > 0 && (
        <ComponentChecklist
          unitId={unit.id}
          currentStage={unit.currentStage}
          components={components}
          initialChecks={initialChecks}
        />
      )}

      {/* QC Checklist — only for QC_USER / ADMIN / PRODUCTION_MANAGER at QC stage */}
      {unit.currentStage === 'QC_AND_SOFTWARE' && canDoQC ? (
        <QcChecklist
          unitId={unit.id}
          currentStatus={unit.currentStatus}
          serialNumber={unit.serialNumber}
          productName={unit.product?.name ?? ''}
          orderNumber={unit.order?.orderNumber ?? ''}
          qcBarcode={unit.qcBarcode ?? null}
        />
      ) : (
        <WorkTabs
          unitId={unit.id}
          unitSerial={unit.serialNumber}
          stageBarcode={currentStageBarcode}
          currentStage={unit.currentStage}
          currentStatus={unit.currentStatus}
          isEmployee={isEmployee}
          role={session.role}
          orderId={unit.order?.id ?? null}
          reworkRecords={unit.reworkRecords.map((r) => ({
            id: r.id,
            status: r.status,
            correctiveAction: r.correctiveAction ?? null,
            rootCauseStage: r.rootCauseStage ?? null,
            rootCauseCategory: r.rootCauseCategory ? { name: r.rootCauseCategory.name } : null,
            assignedUser: r.assignedUser ? { name: r.assignedUser.name } : null,
            createdAt: r.createdAt.toISOString(),
          }))}
          powerstageBarcode={unit.powerstageBarcode ?? null}
          brainboardBarcode={unit.brainboardBarcode ?? null}
        />
      )}

      {/* QC Results */}
      {unit.qcRecords && unit.qcRecords.length > 0 && (
        <div className="card p-4">
          <h3 className="font-medium text-sm mb-3">QC Results</h3>
          <ul className="space-y-2">
            {unit.qcRecords.map((qc) => (
              <li key={qc.id} className="flex items-center gap-2 text-sm">
                <span className={`font-medium ${qc.result === 'PASS' ? 'text-green-400' : 'text-red-400'}`}>{qc.result}</span>
                <span className="text-zinc-600">{new Date(qc.createdAt).toLocaleString()}</span>
                {qc.remarks && <span className="text-zinc-500">· {qc.remarks}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* QC test report — only visible once QC has been performed */}
      {unit.qcBarcode && unit.qcRecords && unit.qcRecords.length > 0 && (
        <QcReportPrint
          unitId={unit.id}
          qcBarcode={unit.qcBarcode}
          result={unit.qcRecords[0].result ?? '—'}
          date={new Date(unit.qcRecords[0].createdAt).toLocaleString()}
        />
      )}

      {/* Dispatch section — shown once Final Assembly is complete */}
      {(unit.currentStage === 'FINAL_ASSEMBLY' &&
        (unit.currentStatus === 'COMPLETED' || unit.currentStatus === 'APPROVED')) ||
        unit.readyForDispatch ? (
        <DispatchSection
          unitId={unit.id}
          serialNumber={unit.serialNumber}
          productName={unit.product?.name ?? ''}
          productCode={unit.product?.code ?? ''}
          orderNumber={unit.order?.orderNumber ?? ''}
          finalAssemblyBarcode={unit.finalAssemblyBarcode ?? null}
          readyForDispatch={unit.readyForDispatch}
          dispatchedAt={
            unit.timelineLogs.find((l) => l.action === 'dispatched')?.createdAt.toISOString() ?? null
          }
          dispatchedBy={
            unit.timelineLogs.find((l) => l.action === 'dispatched')?.user?.name ?? null
          }
          sessionRole={session.role}
        />
      ) : null}

      <UnitActions unit={JSON.parse(JSON.stringify(unit))} sessionRole={session.role} />

      {/* Timeline — full audit trail, all events */}
      {unit.timelineLogs.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-sm">Timeline</h3>
            <span className="text-[11px] text-zinc-600">{unit.timelineLogs.length} event{unit.timelineLogs.length !== 1 ? 's' : ''}</span>
          </div>
          <ol className="relative space-y-0">
            {unit.timelineLogs.map((log, idx) => {
              /* ── colour coding by action category ── */
              const action = log.action ?? '';
              const dotColor =
                action.includes('completed') || action.includes('approved') || action.includes('passed')
                  ? '#4ade80'
                  : action.includes('rejected') || action.includes('blocked') || action.includes('failed')
                  ? '#f87171'
                  : action.includes('rework')
                  ? '#fb923c'
                  : action.includes('started') || action.includes('assigned') || action.includes('in_progress')
                  ? '#fbbf24'
                  : '#38bdf8';

              const actionLabel = action.replace(/_/g, ' ');

              const stageLabel: Record<string, string> = {
                POWERSTAGE_MANUFACTURING: 'Powerstage',
                BRAINBOARD_MANUFACTURING: 'Brainboard',
                CONTROLLER_ASSEMBLY: 'Assembly',
                QC_AND_SOFTWARE: 'QC & Software',
                FINAL_ASSEMBLY: 'Final Assembly',
                REWORK: 'Rework',
              };

              const isLast = idx === unit.timelineLogs.length - 1;

              return (
                <li key={log.id} className="flex gap-3 pb-4 last:pb-0">
                  {/* Dot + vertical line */}
                  <div className="flex flex-col items-center shrink-0" style={{ width: 14 }}>
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
                      style={{ background: dotColor, boxShadow: `0 0 0 2px rgba(0,0,0,0.6)` }}
                    />
                    {!isLast && (
                      <div className="flex-1 w-px mt-1" style={{ background: 'rgba(255,255,255,0.07)', minHeight: 16 }} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-zinc-200 text-sm font-medium capitalize">{actionLabel}</span>
                      {log.stage && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                          style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}
                        >
                          {stageLabel[log.stage] ?? log.stage}
                        </span>
                      )}
                      {(log.statusFrom || log.statusTo) && (
                        <span className="text-[10px] text-zinc-600 shrink-0">
                          {log.statusFrom && log.statusFrom.replace(/_/g, ' ')}
                          {log.statusFrom && log.statusTo && ' → '}
                          {log.statusTo && <span className="text-zinc-400">{log.statusTo.replace(/_/g, ' ')}</span>}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
                      <span className="text-[11px] text-zinc-600">
                        {new Date(log.createdAt).toLocaleString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      {log.user && (
                        <span className="text-[11px] text-zinc-500">· {log.user.name}</span>
                      )}
                    </div>
                    {log.remarks && (
                      <p className="text-xs text-zinc-500 mt-1 italic">{log.remarks}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
