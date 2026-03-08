'use client';

export function QcReportPrint({
  serialNumber,
  qcBarcode,
  result,
  date,
}: {
  serialNumber: string;
  qcBarcode: string;
  result: string;
  date: string;
}) {
  return (
    <div className="bg-smx-surface border border-slate-600 rounded-xl p-4 print:block" id="qc-test-report">
      <h3 className="font-medium mb-2">QC test report (printable — barcode on report)</h3>
      <p className="text-slate-400 text-sm">Serial: <span className="font-mono text-white">{serialNumber}</span></p>
      <p className="text-slate-400 text-sm mt-1">QC barcode: <span className="font-mono text-sky-400 text-lg">{qcBarcode}</span></p>
      <p className="text-slate-400 text-sm mt-1">Result: <span className={result === 'PASS' ? 'text-green-400' : 'text-red-400'}>{result}</span></p>
      <p className="text-slate-400 text-sm">Date: {date}</p>
      <button type="button" onClick={() => window.print()} className="mt-3 py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm tap-target no-print">
        Print QC test report
      </button>
    </div>
  );
}
