import { prisma } from './prisma';

/**
 * Returns the current Indian fiscal year as "YY-YY" (e.g., "25-26").
 * Fiscal year runs April 1 → March 31.
 */
export function getFiscalYear(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed
  const year  = date.getFullYear();
  if (month >= 3) {
    // April (3) through December (11) → FY starts this year
    const y1 = year % 100;
    const y2 = (year + 1) % 100;
    return `${String(y1).padStart(2, '0')}-${String(y2).padStart(2, '0')}`;
  } else {
    // January (0) through March (2) → FY started last year
    const y1 = (year - 1) % 100;
    const y2 = year % 100;
    return `${String(y1).padStart(2, '0')}-${String(y2).padStart(2, '0')}`;
  }
}

/**
 * Generates the next proforma invoice number in the format: TSM/PI/YY-YY/NNN
 * Thread-safe: finds the highest existing number for the current fiscal year and increments.
 */
export async function generateNextInvoiceNumber(): Promise<string> {
  const fy     = getFiscalYear();
  const prefix = `TSM/PI/${fy}/`;

  const latest = await prisma.proformaInvoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.invoiceNumber.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  return `${prefix}${String(next).padStart(3, '0')}`;
}

/**
 * Generates the next export sale invoice number: TSM/ES/YY-YY/0001
 * Resets to 0001 on 1st April each year.
 */
export async function generateNextExportInvoiceNumber(): Promise<string> {
  const fy     = getFiscalYear();
  const prefix = `TSM/ES/${fy}/`;

  const latest = await prisma.proformaInvoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.invoiceNumber.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  return `${prefix}${String(next).padStart(4, '0')}`;
}

/**
 * Generates the next domestic sale invoice number: TSM/DS/YY-YY/0001
 * Resets to 0001 on 1st April each year.
 */
export async function generateNextDomesticInvoiceNumber(): Promise<string> {
  const fy     = getFiscalYear();
  const prefix = `TSM/DS/${fy}/`;

  const latest = await prisma.proformaInvoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.invoiceNumber.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  return `${prefix}${String(next).padStart(4, '0')}`;
}

/**
 * Generates the next Dispatch Order number: TSM/DO/YY-YY/0001
 * Queries the dispatch_orders table. Resets to 0001 on 1st April each year.
 */
export async function generateNextDONumber(): Promise<string> {
  const fy     = getFiscalYear();
  const prefix = `TSM/DO/${fy}/`;

  const latest = await prisma.dispatchOrder.findFirst({
    where: { doNumber: { startsWith: prefix } },
    orderBy: { doNumber: 'desc' },
    select: { doNumber: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.doNumber.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  return `${prefix}${String(next).padStart(4, '0')}`;
}

/**
 * Generates the next GRN (Goods Receipt Note) number: GRN/YY-YY/001
 * Resets to 001 on 1st April each year.
 */
export async function generateNextGRNNumber(): Promise<string> {
  const fy     = getFiscalYear();
  const prefix = `GRN/${fy}/`;

  const latest = await prisma.goodsReceipt.findFirst({
    where: { grnNumber: { startsWith: prefix } },
    orderBy: { grnNumber: 'desc' },
    select: { grnNumber: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.grnNumber.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  return `${prefix}${String(next).padStart(3, '0')}`;
}

/**
 * Generates the next inventory batch code: BATCH/YY-YY/001
 * Resets to 001 on 1st April each year.
 */
export async function generateNextBatchCode(): Promise<string> {
  const fy     = getFiscalYear();
  const prefix = `BATCH/${fy}/`;

  const latest = await prisma.inventoryBatch.findFirst({
    where: { batchCode: { startsWith: prefix } },
    orderBy: { batchCode: 'desc' },
    select: { batchCode: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.batchCode.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  return `${prefix}${String(next).padStart(3, '0')}`;
}

/**
 * Generates the next Material code: MAT/001
 */
export async function generateNextMaterialCode(): Promise<string> {
  const prefix = `MAT/`;

  const latest = await prisma.rawMaterial.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.code.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  return `${prefix}${String(next).padStart(3, '0')}`;
}

/**
 * Generates the next Invoice number from the invoices table (NOT proforma_invoices).
 * Export:   TSM/ES/YY-YY/0001
 * Domestic: TSM/DS/YY-YY/0001
 * Resets to 0001 on 1st April each year.
 */
export async function generateNextFinalInvoiceNumber(isExport: boolean): Promise<string> {
  const fy     = getFiscalYear();
  const prefix = isExport ? `TSM/ES/${fy}/` : `TSM/DS/${fy}/`;

  const latest = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.invoiceNumber.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  return `${prefix}${String(next).padStart(4, '0')}`;
}

/**
 * Generates the next Packing Slip number: TSM/PS/YY-YY/0001
 */
export async function generateNextPackingSlipNumber(): Promise<string> {
  const fy     = getFiscalYear();
  const prefix = `TSM/PS/${fy}/`;

  const latest = await prisma.packingSlip.findFirst({
    where: { slipNumber: { startsWith: prefix } },
    orderBy: { slipNumber: 'desc' },
    select: { slipNumber: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.slipNumber.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  return `${prefix}${String(next).padStart(4, '0')}`;
}

/**
 * Generates the next Packing List number: TSM/PL/YY-YY/0001
 */
export async function generateNextPackingListNumber(): Promise<string> {
  const fy     = getFiscalYear();
  const prefix = `TSM/PL/${fy}/`;

  const latest = await prisma.packingList.findFirst({
    where: { listNumber: { startsWith: prefix } },
    orderBy: { listNumber: 'desc' },
    select: { listNumber: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.listNumber.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  return `${prefix}${String(next).padStart(4, '0')}`;
}
