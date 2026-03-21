const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Match the exact logic from lib/barcode.ts → finalAssemblyPrefix
const FINAL_ASSEMBLY_MONTH_CODES = ['JA', 'FE', 'MR', 'AP', 'MY', 'JN', 'JL', 'AU', 'SE', 'OC', 'NO', 'DE'];

function finalAssemblyPrefix(code, date = new Date()) {
  const cleanCode = code.trim().toUpperCase();
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  const month = FINAL_ASSEMBLY_MONTH_CODES[date.getMonth()] ?? 'JA';
  return `${cleanCode}${year}${month}`;
}

async function nextSequence(field, prefix) {
  const existing = await prisma.controllerUnit.findMany({
    where: { [field]: { startsWith: prefix } },
    select: { [field]: true },
  });
  let max = 0;
  for (const row of existing) {
    const val = row[field];
    if (val) {
      const num = parseInt(val.slice(prefix.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return max + 1;
}

async function main() {
  // ── Unit 003: fix FA barcode to correct format + readyForDispatch ─────────
  const unit003 = await prisma.controllerUnit.findFirst({
    where: { serialNumber: 'SMXL35026003' },
    select: { id: true, finalAssemblyBarcode: true, product: { select: { code: true } } }
  });

  const productCode = unit003.product.code; // 'L350'
  const prefix = finalAssemblyPrefix(productCode); // 'L35026MR'
  const seq = await nextSequence('finalAssemblyBarcode', prefix);
  const faBarcode003 = prefix + String(seq).padStart(3, '0'); // 'L35026MR002'

  console.log('Correct FA barcode for 003:', faBarcode003);

  await prisma.controllerUnit.update({
    where: { id: unit003.id },
    data: { readyForDispatch: true, finalAssemblyBarcode: faBarcode003 }
  });
  console.log('Updated unit 003 — readyForDispatch: true, finalAssemblyBarcode:', faBarcode003);

  // ── Unit 002: just confirm readyForDispatch (already has correct FA barcode)
  const unit002 = await prisma.controllerUnit.findFirst({
    where: { serialNumber: 'SMXL35026002' },
    select: { id: true, finalAssemblyBarcode: true, readyForDispatch: true }
  });
  if (!unit002.readyForDispatch) {
    await prisma.controllerUnit.update({
      where: { id: unit002.id },
      data: { readyForDispatch: true }
    });
  }
  console.log('Unit 002 — readyForDispatch: true, finalAssemblyBarcode:', unit002.finalAssemblyBarcode);

  // ── Verify ────────────────────────────────────────────────────────────────
  const verify = await prisma.controllerUnit.findMany({
    where: { serialNumber: { in: ['SMXL35026002', 'SMXL35026003'] } },
    select: { serialNumber: true, currentStage: true, currentStatus: true, readyForDispatch: true, finalAssemblyBarcode: true }
  });
  console.log('\nVerification:');
  console.log(JSON.stringify(verify, null, 2));

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
