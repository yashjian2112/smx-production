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
      reworkRecords: { include: { rootCauseCategory: true, assignedUser: true }, orderBy: { createdAt: 'desc' } },
      timelineLogs: { include: { user: true }, orderBy: { createdAt: 'desc' }, take: 30 },
      componentChecks: {
        include: { component: true, checker: { select: { id: true, name: true } } },
      },
    },
  });

  if (!unit) notFound();

  const statusColors: Record<string, string> = {
    PENDING: 'text-zinc-400',
    IN_PROGRESS: 'text-amber-400',
    COMPLETED: 'text-green-400',
    BLOCKED: 'text-red-400',
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
            {unit.currentStatus.replace(/_/g, ' ')}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium text-zinc-400"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {stageLabels[unit.currentStage] ?? unit.currentStage}
          </span>
        </div>
      </div>

      {/* Stage barcodes with QR codes */}
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

      {/* Component checklist */}
      {components.length > 0 && (
        <ComponentChecklist
          unitId={unit.id}
          currentStage={unit.currentStage}
          components={components}
          initialChecks={initialChecks}
        />
      )}

      {/* Work + History tabs */}
      <WorkTabs
        unitId={unit.id}
        unitSerial={unit.serialNumber}
        stageBarcode={currentStageBarcode}
        currentStage={unit.currentStage}
        currentStatus={unit.currentStatus}
        isEmployee={session.role === 'PRODUCTION_EMPLOYEE'}
      />

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
          serialNumber={unit.serialNumber}
          qcBarcode={unit.qcBarcode}
          result={unit.qcRecords[0].result ?? '—'}
          date={new Date(unit.qcRecords[0].createdAt).toLocaleString()}
        />
      )}

      <UnitActions unit={JSON.parse(JSON.stringify(unit))} sessionRole={session.role} />

      {/* Timeline */}
      <div>
        <h3 className="font-medium text-sm mb-3">Timeline</h3>
        <ul className="space-y-2">
          {unit.timelineLogs.map((log) => (
            <li key={log.id} className="text-sm border-l-2 pl-3 py-1" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <span className="text-zinc-600 text-xs">{new Date(log.createdAt).toLocaleString()}</span>
              <span className="text-zinc-400 ml-2">{log.action}</span>
              {log.user && <span className="text-zinc-600 ml-1">· {log.user.name}</span>}
              {log.remarks && <span className="block text-zinc-600 text-xs">{log.remarks}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
