import { prisma } from './prisma';

/**
 * Generates the next barcode for a raw material using a user-supplied prefix.
 * Format: {PREFIX}{4-digit seq} — e.g. CAP0001, BUSBAR0001, IGBT0001
 * Prefix is required (min 2 chars). Sequence is MAX+1 — never collides even after deletes.
 */
export async function generateMaterialBarcode(categoryId?: string | null, customPrefix?: string | null): Promise<string> {
  if (!customPrefix || customPrefix.trim().length < 2) {
    throw new Error('Barcode prefix is required (min 2 characters)');
  }
  const prefix = customPrefix.trim().toUpperCase();

  // MAX+1 sequential — never collides even after deletes
  const existing = await prisma.rawMaterial.findMany({
    where: { barcode: { startsWith: prefix } },
    select: { barcode: true },
  });

  let maxSeq = 0;
  for (const m of existing) {
    const numPart = m.barcode?.slice(prefix.length);
    const n = parseInt(numPart ?? '0', 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }

  // Pad sequence so total barcode is at least 8 chars
  const seqLen = Math.max(4, 8 - prefix.length);
  return `${prefix}${String(maxSeq + 1).padStart(seqLen, '0')}`;
}
