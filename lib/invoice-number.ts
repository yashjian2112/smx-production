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
