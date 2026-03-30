'use client';

import { useEffect } from 'react';
import { Barcode128 } from '@/components/Barcode128';

type Material = {
  id: string;
  materialName: string;
  unit: string;
  qtyRequested: number;
  status: string;
  requestedBy: { name: string };
};

type RepairLog = {
  id: string;
  issue: string;
  workDone: string | null;
  startedAt: string;
  completedAt: string | null;
  employee: { name: string };
};

type RTNData = {
  id: string;
  returnNumber: string;
  serialNumber: string | null;
  type: string;
  reportedIssue: string;
  status: string;
  createdAt: string;
  client: { customerName: string; code: string };
  unit: { serialNumber: string; product: { name: string; code: string } } | null;
  reportedBy: { name: string };
  repairLogs: RepairLog[];
  materials: Material[];
};

const TYPE_LABELS: Record<string, string> = {
  WARRANTY:   'Warranty',
  DAMAGE:     'Damage',
  WRONG_ITEM: 'Wrong Item',
  OTHER:      'Other',
};

const STATUS_LABELS: Record<string, string> = {
  REPORTED:      'Reported',
  EVALUATED:     'Evaluated',
  APPROVED:      'Approved',
  UNIT_RECEIVED: 'Unit Received',
  IN_REPAIR:     'In Repair',
  REPAIRED:      'Repaired',
  QC_CHECKED:    'QC Checked',
  DISPATCHED:    'Dispatched',
  CLOSED:        'Closed',
  REJECTED:      'Rejected',
};

export default function PrintRTN({ data, settings }: { data: RTNData; settings: Record<string, string> }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  const date = new Date(data.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const serial = data.unit?.serialNumber ?? data.serialNumber ?? '—';
  const product = data.unit?.product.name ?? '—';
  const latestLog = data.repairLogs[0] ?? null;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 11, color: '#000', padding: 16, maxWidth: 600, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, borderBottom: '2px solid #000', paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{settings['company_name'] ?? 'SMX Drives'}</div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Rework / Replacement Job Card</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>{data.returnNumber}</div>
          <div style={{ fontSize: 10, color: '#555' }}>{date}</div>
          <div style={{ fontSize: 10, marginTop: 2 }}>Status: <strong>{STATUS_LABELS[data.status] ?? data.status}</strong></div>
        </div>
      </div>

      {/* Barcode */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        <Barcode128 value={data.returnNumber} height={48} displayValue />
      </div>

      {/* Two-column info */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14, fontSize: 11 }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', paddingBottom: 6, verticalAlign: 'top' }}>
              <div style={{ color: '#666', fontSize: 9, textTransform: 'uppercase', marginBottom: 2 }}>Customer</div>
              <div style={{ fontWeight: 600 }}>{data.client.customerName}</div>
              <div style={{ color: '#666', fontSize: 10 }}>{data.client.code}</div>
            </td>
            <td style={{ width: '50%', paddingBottom: 6, verticalAlign: 'top' }}>
              <div style={{ color: '#666', fontSize: 9, textTransform: 'uppercase', marginBottom: 2 }}>Controller Unit</div>
              <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{serial}</div>
              <div style={{ color: '#666', fontSize: 10 }}>{product}</div>
            </td>
          </tr>
          <tr>
            <td style={{ paddingBottom: 6, verticalAlign: 'top' }}>
              <div style={{ color: '#666', fontSize: 9, textTransform: 'uppercase', marginBottom: 2 }}>Return Type</div>
              <div style={{ fontWeight: 600 }}>{TYPE_LABELS[data.type] ?? data.type}</div>
            </td>
            <td style={{ paddingBottom: 6, verticalAlign: 'top' }}>
              <div style={{ color: '#666', fontSize: 9, textTransform: 'uppercase', marginBottom: 2 }}>Logged By</div>
              <div style={{ fontWeight: 600 }}>{data.reportedBy.name}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Reported Issue */}
      <div style={{ border: '1px solid #ccc', borderRadius: 4, padding: '8px 10px', marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Reported Issue</div>
        <div style={{ lineHeight: 1.5 }}>{data.reportedIssue}</div>
      </div>

      {/* Materials table */}
      {data.materials.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6, borderBottom: '1px solid #ccc', paddingBottom: 4 }}>
            Components Required
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid #ddd' }}>Component</th>
                <th style={{ textAlign: 'center', padding: '4px 6px', borderBottom: '1px solid #ddd' }}>Qty</th>
                <th style={{ textAlign: 'center', padding: '4px 6px', borderBottom: '1px solid #ddd' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid #ddd' }}>Requested By</th>
              </tr>
            </thead>
            <tbody>
              {data.materials.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #eee' }}>{m.materialName}</td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #eee', textAlign: 'center' }}>{m.qtyRequested} {m.unit}</td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                    <span style={{ fontWeight: 600, color: m.status === 'ISSUED' ? '#16a34a' : '#d97706' }}>
                      {m.status === 'ISSUED' ? 'Issued' : 'Pending'}
                    </span>
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #eee' }}>{m.requestedBy.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Latest repair log */}
      {latestLog && (
        <div style={{ border: '1px solid #ccc', borderRadius: 4, padding: '8px 10px', marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Repair Diagnosis — {latestLog.employee.name}</div>
          <div style={{ lineHeight: 1.5 }}>{latestLog.issue}</div>
          {latestLog.workDone && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', marginBottom: 2 }}>Work Done</div>
              <div style={{ lineHeight: 1.5 }}>{latestLog.workDone}</div>
            </div>
          )}
        </div>
      )}

      {/* Signature strip */}
      <div style={{ display: 'flex', gap: 16, marginTop: 20 }}>
        {['Received By (Store)', 'Technician', 'QC Approved By'].map(label => (
          <div key={label} style={{ flex: 1, borderTop: '1px solid #999', paddingTop: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: '#888' }}>{label}</div>
            <div style={{ height: 28 }} />
            <div style={{ fontSize: 9, color: '#aaa' }}>Name / Date</div>
          </div>
        ))}
      </div>

      <style>{`@media print { @page { size: A5 portrait; margin: 10mm; } }`}</style>
    </div>
  );
}
