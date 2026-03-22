import { prisma } from './prisma';

/**
 * Generates the next barcode for a raw material.
 * Format: {CATEGORY_CODE}{seq padded to 3} e.g. CAP001, PCB002
 * Falls back to RM{seq} if no category.
 */
export async function generateMaterialBarcode(categoryId?: string | null): Promise<string> {
  if (categoryId) {
    const category = await prisma.materialCategory.findUnique({
      where: { id: categoryId },
      select: { code: true },
    });
    if (category?.code) {
      const prefix = category.code.toUpperCase();
      const count = await prisma.rawMaterial.count({
        where: { barcode: { startsWith: prefix } },
      });
      return `${prefix}${String(count + 1).padStart(3, '0')}`;
    }
  }
  // No category — use RM prefix
  const count = await prisma.rawMaterial.count({
    where: { barcode: { startsWith: 'RM' } },
  });
  return `RM${String(count + 1).padStart(3, '0')}`;
}
