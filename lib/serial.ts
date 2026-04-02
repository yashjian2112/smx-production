import { prisma } from './prisma';

/**
 * Get fiscal quarter code based on month.
 * Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar
 */
function getQuarterCode(): string {
  const month = new Date().getMonth(); // 0-11
  if (month >= 3 && month <= 5) return 'Q1';  // Apr-Jun
  if (month >= 6 && month <= 8) return 'Q2';  // Jul-Sep
  if (month >= 9 && month <= 11) return 'Q3'; // Oct-Dec
  return 'Q4'; // Jan-Mar
}

/**
 * Generate next serial number: modelCode + year (2) + quarter + sequence (3).
 * Example: CL35026Q1001 (CL350, 2026, Q1, unit 001)
 * This is also used as the Final Assembly barcode (same value).
 */
export async function generateNextSerial(modelCode: string): Promise<string> {
  const code = modelCode.trim().toUpperCase();
  const year = new Date().getFullYear() % 100;
  const yearStr = String(year).padStart(2, '0');
  const quarter = getQuarterCode();
  const prefix = `${code}${yearStr}${quarter}`;

  const last = await prisma.controllerUnit.findFirst({
    where: {
      serialNumber: { startsWith: prefix },
    },
    orderBy: { serialNumber: 'desc' },
  });

  let nextSeq = 1;
  if (last?.serialNumber) {
    const seqPart = last.serialNumber.slice(prefix.length);
    nextSeq = (parseInt(seqPart, 10) || 0) + 1;
    if (nextSeq > 999) throw new Error('Serial sequence exhausted for this quarter');
  }

  const serial = `${prefix}${String(nextSeq).padStart(3, '0')}`;

  const exists = await prisma.controllerUnit.findUnique({ where: { serialNumber: serial } });
  if (exists) throw new Error('Serial collision');

  return serial;
}

/**
 * Generate next stage barcode: productCode + suffix + year (2) + sequence (3).
 * Example: C350PS26001 (Powerstage), C350BB26001 (Brainboard), C350QC26001 (QC)
 */
export async function generateStageBarcode(productCode: string, suffix: 'PS' | 'BB' | 'QC' | 'FA'): Promise<string> {
  const year = new Date().getFullYear() % 100;
  const yearStr = String(year).padStart(2, '0');
  const prefix = `${productCode}${suffix}${yearStr}`;

  const field = suffix === 'PS' ? 'powerstageBarcode' :
                suffix === 'BB' ? 'brainboardBarcode' :
                suffix === 'QC' ? 'qcBarcode' :
                'finalAssemblyBarcode';

  const last = await prisma.controllerUnit.findFirst({
    where: { [field]: { startsWith: prefix } },
    orderBy: { [field]: 'desc' },
  });

  const lastVal = last ? (last as unknown as Record<string, string | null>)[field] ?? null : null;
  let nextSeq = 1;
  if (lastVal) {
    nextSeq = parseInt(lastVal.slice(-3), 10) + 1;
    if (nextSeq > 999) throw new Error('Stage barcode sequence exhausted');
  }
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

export function parseSerial(serial: string): { prefix: string; modelCode: string; year: number; quarter: string; sequence: number } | null {
  // New format: modelCode + year (2) + Q1-Q4 + sequence (3) — e.g. CL35026Q1001
  const matchNew = serial.match(/^(.+?)(\d{2})(Q[1-4])(\d{3})$/);
  if (matchNew) {
    return {
      prefix: '',
      modelCode: matchNew[1],
      year: 2000 + parseInt(matchNew[2], 10),
      quarter: matchNew[3],
      sequence: parseInt(matchNew[4], 10),
    };
  }
  // Legacy format: SMX + modelCode + year (2) + sequence (3) — e.g. SMXCL35026001
  const matchOld = serial.match(/^SMX(.+?)(\d{2})(\d{3})$/);
  if (matchOld) {
    return {
      prefix: 'SMX',
      modelCode: matchOld[1],
      year: 2000 + parseInt(matchOld[2], 10),
      quarter: '',
      sequence: parseInt(matchOld[3], 10),
    };
  }
  return null;
}
