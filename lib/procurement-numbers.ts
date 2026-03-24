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
  for (let attempt = 0; attempt < 10; attempt++) {
    const last = await prisma.requirementOrder.findFirst({
      where: { roNumber: { startsWith: prefix } },
      orderBy: { roNumber: 'desc' },
    });
    const base = last ? parseInt(last.roNumber.split('/').pop()!) + 1 : 1;
    const candidate = `${prefix}${pad(base + attempt)}`;
    const exists = await prisma.requirementOrder.findUnique({ where: { roNumber: candidate } });
    if (!exists) return candidate;
  }
  throw new Error('Could not generate unique RO number');
}

export async function generateRFQNumber(): Promise<string> {
  const fy = getFiscalYear();
  const prefix = `RFQ/${fy}/`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const last = await prisma.rFQ.findFirst({
      where: { rfqNumber: { startsWith: prefix } },
      orderBy: { rfqNumber: 'desc' },
    });
    const base = last ? parseInt(last.rfqNumber.split('/').pop()!) + 1 : 1;
    const candidate = `${prefix}${pad(base + attempt)}`;
    const exists = await prisma.rFQ.findUnique({ where: { rfqNumber: candidate } });
    if (!exists) return candidate;
  }
  throw new Error('Could not generate unique RFQ number');
}

export async function generatePONumber(): Promise<string> {
  const fy = getFiscalYear();
  const prefix = `PO/${fy}/`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const last = await prisma.purchaseOrder.findFirst({
      where: { poNumber: { startsWith: prefix } },
      orderBy: { poNumber: 'desc' },
    });
    const base = last ? parseInt(last.poNumber.split('/').pop()!) + 1 : 1;
    const candidate = `${prefix}${pad(base + attempt)}`;
    const exists = await prisma.purchaseOrder.findUnique({ where: { poNumber: candidate } });
    if (!exists) return candidate;
  }
  throw new Error('Could not generate unique PO number');
}

export async function generateGANNumber(): Promise<string> {
  const fy = getFiscalYear();
  const prefix = `GAN/${fy}/`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const last = await prisma.goodsArrivalNote.findFirst({
      where: { ganNumber: { startsWith: prefix } },
      orderBy: { ganNumber: 'desc' },
    });
    const base = last ? parseInt(last.ganNumber.split('/').pop()!) + 1 : 1;
    const candidate = `${prefix}${pad(base + attempt)}`;
    const exists = await prisma.goodsArrivalNote.findUnique({ where: { ganNumber: candidate } });
    if (!exists) return candidate;
  }
  throw new Error('Could not generate unique GAN number');
}

export async function generateGRNNumber(): Promise<string> {
  const fy = getFiscalYear();
  const prefix = `GRN/${fy}/`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const last = await prisma.goodsReceipt.findFirst({
      where: { grnNumber: { startsWith: prefix } },
      orderBy: { grnNumber: 'desc' },
    });
    const base = last ? parseInt(last.grnNumber.split('/').pop()!) + 1 : 1;
    const candidate = `${prefix}${pad(base + attempt)}`;
    const exists = await prisma.goodsReceipt.findUnique({ where: { grnNumber: candidate } });
    if (!exists) return candidate;
  }
  throw new Error('Could not generate unique GRN number');
}
