import { StageType } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Stage-wise barcodes for cross-verification. No printable BOM sheet.
 * Format: modelname + stageSuffix + year(2) + sequence(3), except Final Assembly
 * which uses modelname + year(2) + batchMonth(2) + sequence(3).
 * Powerstage: 1000PS26001, Brainboard: 1000BB26001, QC: 1000QC26001, Final: SM35026MR001
 */

const YEAR_STR = String(new Date().getFullYear() % 100).padStart(2, '0');
const FINAL_ASSEMBLY_MONTH_CODES = ['JA', 'FE', 'MR', 'AP', 'MY', 'JN', 'JL', 'AU', 'SE', 'OC', 'NO', 'DE'] as const;

function modelPrefix(code: string): string {
  return code.trim().toUpperCase();
}

function finalAssemblyPrefix(code: string, date = new Date()): string {
  const cleanCode = code.trim().toUpperCase();
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  const month = FINAL_ASSEMBLY_MONTH_CODES[date.getMonth()] ?? 'JA';
  return `${cleanCode}${year}${month}`;
}

async function nextSequence(
  field: 'powerstageBarcode' | 'brainboardBarcode' | 'assemblyBarcode' | 'qcBarcode' | 'finalAssemblyBarcode',
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

/** Assembly: modelnameAY26001 */
export async function generateNextAssemblyBarcode(modelCode: string): Promise<string> {
  const prefix = `${modelPrefix(modelCode)}AY${YEAR_STR}`;
  const seq = await nextSequence('assemblyBarcode', prefix, 3);
  const barcode = `${prefix}${String(seq).padStart(3, '0')}`;
  const exists = await prisma.controllerUnit.findFirst({ where: { assemblyBarcode: barcode } });
  if (exists) throw new Error('Assembly barcode collision');
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

/** Final Assembly: modelname26MR001 (month-batch + 3-digit sequence) */
export async function generateNextFinalAssemblyBarcode(modelCode: string): Promise<string> {
  const prefix = finalAssemblyPrefix(modelCode);
  const seq = await nextSequence('finalAssemblyBarcode', prefix, 3);
  const barcode = `${prefix}${String(seq).padStart(3, '0')}`;
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

/** Map component stage suffix → controller stage key */
const COMP_SUFFIX_TO_STAGE: Record<string, string> = {
  PS: 'POWERSTAGE_MANUFACTURING',
  BB: 'BRAINBOARD_MANUFACTURING',
  AS: 'CONTROLLER_ASSEMBLY',
  FA: 'FINAL_ASSEMBLY',
  QC: 'QC_AND_SOFTWARE',
};

/** Parse a COMP- barcode to extract product code and stage.
 *  Format: COMP-{productCode}{stageSuffix(2)}{seq(4)}
 *  e.g. COMP-L350PS0002 → { productCode: 'L350', stageKey: 'POWERSTAGE_MANUFACTURING' }
 */
export function parseComponentBarcode(barcode: string): { productCode: string; stageKey: string } | null {
  const upper = barcode.trim().toUpperCase();
  if (!upper.startsWith('COMP-')) return null;
  const inner = upper.slice(5); // e.g. "L350PS0002"
  if (inner.length < 7) return null; // need at least 1 + 2 + 4
  const seq = inner.slice(-4);
  if (!/^\d{4}$/.test(seq)) return null;
  const withoutSeq = inner.slice(0, -4); // "L350PS"
  if (withoutSeq.length < 3) return null;
  const stageSuffix = withoutSeq.slice(-2); // "PS"
  const productCode = withoutSeq.slice(0, -2); // "L350"
  const stageKey = COMP_SUFFIX_TO_STAGE[stageSuffix];
  if (!stageKey || !productCode) return null;
  return { productCode, stageKey };
}

/** When a component barcode is scanned, find the first unit
 *  of that product currently at the matching stage (PENDING or IN_PROGRESS).
 *  This lets workers scan physical component labels (COMP-L350PS0002) to start stage work.
 */
export async function findUnitByComponentBarcode(barcode: string) {
  const parsed = parseComponentBarcode(barcode);
  if (!parsed) return null;
  const { productCode, stageKey } = parsed;
  return prisma.controllerUnit.findFirst({
    where: {
      product: { code: { equals: productCode, mode: 'insensitive' } },
      currentStage: stageKey as StageType,
      currentStatus: { in: ['PENDING', 'IN_PROGRESS'] },
    },
    orderBy: { createdAt: 'asc' }, // first-in, first-out
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

/**
 * Generate barcode for a material serial (individual component received at GRN).
 * Format: {categoryCode}{stageType}{YY}{seq4} — e.g. PCBPS260001
 * Uses 4-digit sequence to distinguish from 3-digit production barcodes.
 * Queries MaterialSerial table so it's independent of production barcode sequences.
 */
export async function generateNextMaterialSerialBarcode(
  categoryCode: string,
  stageType: 'PS' | 'BB'
): Promise<string> {
  const year = String(new Date().getFullYear() % 100).padStart(2, '0');
  const prefix = `${categoryCode.trim().toUpperCase()}${stageType}${year}`;
  const last = await prisma.materialSerial.findFirst({
    where: { barcode: { startsWith: prefix } },
    orderBy: { barcode: 'desc' },
    select: { barcode: true },
  });
  let seq = 1;
  if (last?.barcode) {
    const seqPart = last.barcode.slice(prefix.length);
    seq = (parseInt(seqPart, 10) || 0) + 1;
  }
  if (seq > 9999) throw new Error(`Material serial barcode sequence full for ${prefix}`);
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/** Map stage keys to their barcode DB field */
export const STAGE_BARCODE_FIELD: Record<string, 'powerstageBarcode' | 'brainboardBarcode' | 'assemblyBarcode' | 'qcBarcode' | 'finalAssemblyBarcode' | null> = {
  POWERSTAGE_MANUFACTURING:  'powerstageBarcode',
  BRAINBOARD_MANUFACTURING:  'brainboardBarcode',
  CONTROLLER_ASSEMBLY:       'assemblyBarcode',
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
          { assemblyBarcode: { equals: trimmed, mode: 'insensitive' as const } },
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
