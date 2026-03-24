import { prisma } from '@/lib/prisma';

// Returns current fiscal year string e.g. "26-27" for Apr 2026 - Mar 2027
function getFiscalYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  const startYear = month >= 4 ? year : year - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

function pad(n: number, width = 3): string {
  return String(n).padStart(width, '0');
}

export async function generateRONumber(): Promise<string> {
  const fy = getFiscalYear();
  const prefix = `RO/${fy}/`;
  const last = await prisma.requirementOrder.findFirst({
    where: { roNumber: { startsWith: prefix } },
    orderBy: { roNumber: 'desc' },
  });
  const next = last ? parseInt(last.roNumber.split('/').pop()!) + 1 : 1;
  return `${prefix}${pad(next)}`;
}

export async function generateRFQNumber(): Promise<string> {
  const fy = getFiscalYear();
  const prefix = `RFQ/${fy}/`;
  const last = await prisma.rFQ.findFirst({
    where: { rfqNumber: { startsWith: prefix } },
    orderBy: { rfqNumber: 'desc' },
  });
  const next = last ? parseInt(last.rfqNumber.split('/').pop()!) + 1 : 1;
  return `${prefix}${pad(next)}`;
}

export async function generatePONumber(): Promise<string> {
  const fy = getFiscalYear();
  const prefix = `PO/${fy}/`;
  const last = await prisma.purchaseOrder.findFirst({
    where: { poNumber: { startsWith: prefix } },
    orderBy: { poNumber: 'desc' },
  });
  const next = last ? parseInt(last.poNumber.split('/').pop()!) + 1 : 1;
  return `${prefix}${pad(next)}`;
}

export async function generateGANNumber(): Promise<string> {
  const fy = getFiscalYear();
  const prefix = `GAN/${fy}/`;
  const last = await prisma.goodsArrivalNote.findFirst({
    where: { ganNumber: { startsWith: prefix } },
    orderBy: { ganNumber: 'desc' },
  });
  const next = last ? parseInt(last.ganNumber.split('/').pop()!) + 1 : 1;
  return `${prefix}${pad(next)}`;
}

export async function generateGRNNumber(): Promise<string> {
  const fy = getFiscalYear();
  const prefix = `GRN/${fy}/`;
  const last = await prisma.goodsReceipt.findFirst({
    where: { grnNumber: { startsWith: prefix } },
    orderBy: { grnNumber: 'desc' },
  });
  const next = last ? parseInt(last.grnNumber.split('/').pop()!) + 1 : 1;
  return `${prefix}${pad(next)}`;
}
