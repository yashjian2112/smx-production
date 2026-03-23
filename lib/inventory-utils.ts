import { prisma } from './prisma';

/**
 * Generates the next barcode for a raw material.
 * Format: SMX{CATEGORY_CODE(3)}{4-digit seq}
 * Examples: SMXCAP0001, SMXRES0001, SMXHRD0001, SMX0001 (no category)
 * Min 8 chars, max 12 chars. Uses MAX+1 to avoid collision on delete/re-create.
 */
export async function generateMaterialBarcode(categoryId?: string | null): Promise<string> {
  let categoryCode = '';
  if (categoryId) {
    const category = await prisma.materialCategory.findUnique({
      where: { id: categoryId },
      select: { code: true },
    });
    if (category?.code) categoryCode = category.code.toUpperCase().slice(0, 3);
  }

  const prefix = `SMX${categoryCode}`; // SMXCAP, SMXRES, SMX (no category)

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

  // Ensure total barcode length is 8-12 chars
  const seqLen = Math.max(4, 8 - prefix.length);
  return `${prefix}${String(maxSeq + 1).padStart(seqLen, '0')}`;
}
