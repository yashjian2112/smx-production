import { prisma } from './prisma';

const PREFIX = 'SMX';

/**
 * Generate next serial number: SMX + modelCode (4 digits) + year (2) + sequence (3).
 * Example: SMX100026001
 */
export async function generateNextSerial(modelCode: string): Promise<string> {
  const code = modelCode.padStart(4, '0').slice(0, 4);
  const year = new Date().getFullYear() % 100;
  const yearStr = String(year).padStart(2, '0');

  const last = await prisma.controllerUnit.findFirst({
    where: {
      serialNumber: { startsWith: `${PREFIX}${code}${yearStr}` },
    },
    orderBy: { serialNumber: 'desc' },
  });

  let nextSeq = 1;
  if (last?.serialNumber) {
    const seqPart = last.serialNumber.slice(-3);
    nextSeq = parseInt(seqPart, 10) + 1;
    if (nextSeq > 999) throw new Error('Serial sequence exhausted for this year');
  }

  const serial = `${PREFIX}${code}${yearStr}${String(nextSeq).padStart(3, '0')}`;

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

export function parseSerial(serial: string): { prefix: string; modelCode: string; year: number; sequence: number } | null {
  const match = serial.match(/^SMX(\d{4})(\d{2})(\d{3})$/);
  if (!match) return null;
  return {
    prefix: 'SMX',
    modelCode: match[1],
    year: 2000 + parseInt(match[2], 10),
    sequence: parseInt(match[3], 10),
  };
}
