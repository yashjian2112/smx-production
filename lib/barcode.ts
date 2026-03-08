import { prisma } from './prisma';

/**
 * Stage-wise barcodes for cross-verification. No printable BOM sheet.
 * Format: modelname + stageSuffix + year(2) + sequence(3 or 4 for final).
 * Powerstage: 1000PS26001, Brainboard: 1000BB26001, QC: 1000QC26001, Final: 1000260001
 */

const YEAR_STR = String(new Date().getFullYear() % 100).padStart(2, '0');

function modelPrefix(code: string): string {
  return code.padStart(4, '0').slice(0, 4);
}

async function nextSequence(
  field: 'powerstageBarcode' | 'brainboardBarcode' | 'qcBarcode' | 'finalAssemblyBarcode',
  prefix: string,
  seqLength: number
): Promise<number> {
  const last = await prisma.controllerUnit.findFirst({
    where: { [field]: { not: null, startsWith: prefix } },
    orderBy: { [field]: 'desc' },
    select: { [field]: true },
  });
  const val = (last as unknown as Record<string, string | null> | null)?.[field] ?? null;
  if (!val) return 1;
  const seqPart = val.slice(prefix.length);
  const num = parseInt(seqPart, 10);
  const next = (num || 0) + 1;
  const max = Math.pow(10, seqLength) - 1;
  if (next > max) throw new Error(`Barcode sequence exhausted for ${field}`);
  return next;
}

/** Powerstage: modelnamePS26001 */
export async function generateNextPowerstageBarcode(modelCode: string): Promise<string> {
  const prefix = `${modelPrefix(modelCode)}PS${YEAR_STR}`;
  const seq = await nextSequence('powerstageBarcode', prefix, 3);
  const barcode = `${prefix}${String(seq).padStart(3, '0')}`;
  const exists = await prisma.controllerUnit.findFirst({ where: { powerstageBarcode: barcode } });
  if (exists) throw new Error('Powerstage barcode collision');
  return barcode;
}

/** Brainboard: modelnameBB26001 */
export async function generateNextBrainboardBarcode(modelCode: string): Promise<string> {
  const prefix = `${modelPrefix(modelCode)}BB${YEAR_STR}`;
  const seq = await nextSequence('brainboardBarcode', prefix, 3);
  const barcode = `${prefix}${String(seq).padStart(3, '0')}`;
  const exists = await prisma.controllerUnit.findFirst({ where: { brainboardBarcode: barcode } });
  if (exists) throw new Error('Brainboard barcode collision');
  return barcode;
}

/** QC: modelnameQC26001 (printed on QC test report) */
export async function generateNextQCBarcode(modelCode: string): Promise<string> {
  const prefix = `${modelPrefix(modelCode)}QC${YEAR_STR}`;
  const seq = await nextSequence('qcBarcode', prefix, 3);
  const barcode = `${prefix}${String(seq).padStart(3, '0')}`;
  const exists = await prisma.controllerUnit.findFirst({ where: { qcBarcode: barcode } });
  if (exists) throw new Error('QC barcode collision');
  return barcode;
}

/** Final Assembly: modelname260001 (4-digit sequence) */
export async function generateNextFinalAssemblyBarcode(modelCode: string): Promise<string> {
  const prefix = `${modelPrefix(modelCode)}${YEAR_STR}`;
  const seq = await nextSequence('finalAssemblyBarcode', prefix, 4);
  const barcode = `${prefix}${String(seq).padStart(4, '0')}`;
  const exists = await prisma.controllerUnit.findFirst({ where: { finalAssemblyBarcode: barcode } });
  if (exists) throw new Error('Final assembly barcode collision');
  return barcode;
}

/** Component barcode: COMP- + productCode + stageSuffix + 4-digit seq (0001–9999 per model per stage)
 *  PS=Powerstage, BB=Brainboard, AS=Assembly, FA=FinalAssembly
 *  e.g. COMP-C350PS0001, COMP-C100BB0022, COMP-1000PS0003
 *  The "COMP-" prefix makes component barcodes visually distinct from unit barcodes
 *  (unit barcodes embed the year: C350PS26001)
 */
export async function generateComponentBarcode(
  productCode: string,
  stageSuffix: 'PS' | 'BB' | 'AS' | 'FA' = 'PS'
): Promise<string> {
  const innerPrefix = `${productCode}${stageSuffix}`;
  const fullPrefix = `COMP-${innerPrefix}`;
  const last = await prisma.productComponent.findFirst({
    where: { barcode: { startsWith: fullPrefix } },
    orderBy: { barcode: 'desc' },
    select: { barcode: true },
  });
  const lastVal = last?.barcode;
  let next = 1;
  if (lastVal) {
    next = parseInt(lastVal.slice(fullPrefix.length), 10) + 1;
    if (next > 9999) throw new Error('Component barcode sequence full (max 9999 per stage)');
  }
  return `${fullPrefix}${String(next).padStart(4, '0')}`;
}

/** Check if a barcode belongs to a component (not a unit).
 *  Returns component info if found, null otherwise.
 */
export async function findComponentByBarcode(barcode: string) {
  const trimmed = barcode.trim().toUpperCase();
  return prisma.productComponent.findFirst({
    where: { barcode: { equals: trimmed, mode: 'insensitive' } },
    include: { product: { select: { code: true, name: true } } },
  });
}

/** Map stage keys to their barcode DB field */
export const STAGE_BARCODE_FIELD: Record<string, 'powerstageBarcode' | 'brainboardBarcode' | 'qcBarcode' | 'finalAssemblyBarcode' | null> = {
  POWERSTAGE_MANUFACTURING:  'powerstageBarcode',
  BRAINBOARD_MANUFACTURING:  'brainboardBarcode',
  CONTROLLER_ASSEMBLY:       null,
  QC_AND_SOFTWARE:           'qcBarcode',
  FINAL_ASSEMBLY:            'finalAssemblyBarcode',
  REWORK:                    null,
};

/** Find unit by stage barcode.
 *  If stage is provided, only searches that stage's barcode field.
 *  If no stage (or stage has no barcode field), searches all 4 fields.
 */
export async function findUnitByBarcode(barcode: string, stage?: string) {
  const trimmed = barcode.trim().toUpperCase();
  const field = stage ? STAGE_BARCODE_FIELD[stage] : null;

  const where = field
    ? { [field]: { equals: trimmed, mode: 'insensitive' as const } }
    : {
        OR: [
          { powerstageBarcode: { equals: trimmed, mode: 'insensitive' as const } },
          { brainboardBarcode: { equals: trimmed, mode: 'insensitive' as const } },
          { qcBarcode: { equals: trimmed, mode: 'insensitive' as const } },
          { finalAssemblyBarcode: { equals: trimmed, mode: 'insensitive' as const } },
        ],
      };

  return prisma.controllerUnit.findFirst({
    where,
    include: {
      order: { include: { product: true } },
      product: true,
      assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      stageLogs: { include: { user: true, approvedBy: true }, orderBy: { createdAt: 'desc' } },
      qcRecords: { include: { issueCategory: true }, orderBy: { createdAt: 'desc' } },
      reworkRecords: { include: { rootCauseCategory: true, assignedUser: true }, orderBy: { createdAt: 'desc' } },
      timelineLogs: { include: { user: true }, orderBy: { createdAt: 'desc' }, take: 100 },
    },
  });
}
