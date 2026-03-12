import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const YEAR_STR = String(new Date().getFullYear() % 100).padStart(2, '0');

function modelPrefix(code) {
  return code.padStart(4, '0').slice(0, 4);
}

async function nextSequence(field, prefix, seqLength) {
  const last = await p.controllerUnit.findFirst({
    where: { [field]: { not: null, startsWith: prefix } },
    orderBy: { [field]: 'desc' },
    select: { [field]: true },
  });
  const val = last?.[field] ?? null;
  if (!val) return 1;
  const seqPart = val.slice(prefix.length);
  const num = parseInt(seqPart, 10);
  const next = (num || 0) + 1;
  const max = Math.pow(10, seqLength) - 1;
  if (next > max) throw new Error('Barcode sequence exhausted for ' + field);
  return next;
}

// Backfill barcodes for old units with null barcodes
const oldUnits = await p.controllerUnit.findMany({
  where: { powerstageBarcode: null },
  include: { order: { include: { product: true } } },
});
console.log('Units to backfill:', oldUnits.map(u => u.serialNumber));

for (const unit of oldUnits) {
  const productCode = unit.order?.product?.code ?? '1000';
  const mp = modelPrefix(productCode);

  const psPrefix = mp + 'PS' + YEAR_STR;
  const bbPrefix = mp + 'BB' + YEAR_STR;
  const qcPrefix = mp + 'QC' + YEAR_STR;
  const faPrefix = mp + YEAR_STR;

  const psSeq = await nextSequence('powerstageBarcode', psPrefix, 3);
  const psBarcode = psPrefix + String(psSeq).padStart(3, '0');

  const bbSeq = await nextSequence('brainboardBarcode', bbPrefix, 3);
  const bbBarcode = bbPrefix + String(bbSeq).padStart(3, '0');

  const qcSeq = await nextSequence('qcBarcode', qcPrefix, 3);
  const qcBarcode = qcPrefix + String(qcSeq).padStart(3, '0');

  const faSeq = await nextSequence('finalAssemblyBarcode', faPrefix, 4);
  const faBarcode = faPrefix + String(faSeq).padStart(4, '0');

  await p.controllerUnit.update({
    where: { id: unit.id },
    data: {
      powerstageBarcode: psBarcode,
      brainboardBarcode: bbBarcode,
      qcBarcode: qcBarcode,
      finalAssemblyBarcode: faBarcode,
    },
  });
  console.log('Updated', unit.serialNumber, '-> PS:', psBarcode, '| BB:', bbBarcode, '| QC:', qcBarcode, '| FA:', faBarcode);
}

// Backfill barcode for components with null barcode
const nullComps = await p.productComponent.findMany({
  where: { barcode: null },
  include: { product: true },
});
console.log('\nComponents to backfill:', nullComps.map(c => c.name));

const STAGE_SUFFIX = {
  POWERSTAGE_MANUFACTURING: 'PS',
  BRAINBOARD_MANUFACTURING: 'BB',
  CONTROLLER_ASSEMBLY: 'AS',
  FINAL_ASSEMBLY: 'FA',
  QC_AND_SOFTWARE: 'QC',
  REWORK: 'RW',
};

for (const comp of nullComps) {
  const productCode = comp.product?.code ?? 'UNKN';
  const stageSuffix = STAGE_SUFFIX[comp.stage] ?? 'XX';
  const prefix = productCode + stageSuffix;

  const last = await p.productComponent.findFirst({
    where: { barcode: { startsWith: prefix } },
    orderBy: { barcode: 'desc' },
    select: { barcode: true },
  });
  const lastVal = last?.barcode;
  let next = 1;
  if (lastVal) {
    next = parseInt(lastVal.slice(prefix.length), 10) + 1;
  }
  const barcode = prefix + String(next).padStart(4, '0');

  await p.productComponent.update({ where: { id: comp.id }, data: { barcode } });
  console.log('Updated component', comp.name, '-> barcode:', barcode);
}

console.log('\nAll backfills done!');
await p.$disconnect();
