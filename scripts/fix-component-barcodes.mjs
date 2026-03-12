/**
 * Script: fix-component-barcodes.mjs
 * 1. Delete 11 C350TESTPOWER test components
 * 2. Add COMP- prefix to all existing component barcodes
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== STEP 1: Delete C350TESTPOWER test components ===');
  const deleted = await prisma.productComponent.deleteMany({
    where: { name: 'C350TESTPOWER' },
  });
  console.log(`Deleted ${deleted.count} C350TESTPOWER test components`);

  console.log('\n=== STEP 2: Add COMP- prefix to existing component barcodes ===');
  const components = await prisma.productComponent.findMany({
    where: { barcode: { not: null } },
    select: { id: true, name: true, barcode: true },
  });

  let updated = 0;
  let skipped = 0;
  for (const c of components) {
    if (!c.barcode) { skipped++; continue; }
    if (c.barcode.startsWith('COMP-')) { skipped++; continue; } // already prefixed
    const newBarcode = `COMP-${c.barcode}`;
    await prisma.productComponent.update({
      where: { id: c.id },
      data: { barcode: newBarcode },
    });
    console.log(`  ${c.name}: ${c.barcode} → ${newBarcode}`);
    updated++;
  }
  console.log(`Updated ${updated} barcodes, skipped ${skipped}`);

  console.log('\n=== FINAL STATE ===');
  const final = await prisma.productComponent.findMany({
    select: { name: true, barcode: true },
    orderBy: { barcode: 'asc' },
  });
  for (const c of final) {
    console.log(`  ${c.name}: ${c.barcode}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
