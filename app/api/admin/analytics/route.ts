import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/admin/analytics
// Returns procurement + vendor + production analytics for admin dashboard
export async function GET() {
  const session = await requireSession();
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000);

  const [
    // Procurement
    allPOs, recentPOs,
    // Vendor performance
    vendorPerformance, vendors,
    // ROs
    allROs,
    // Damage reports
    damageReports,
    // Admin notifications (unread)
    unreadNotifications,
    // Price deviations (POs where notes contain "AI selected")
    aiAssignedPOs,
    // Material price history
    topMaterials,
  ] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { createdAt: { gte: ninetyDaysAgo } },
      include: { vendor: { select: { name: true, id: true } }, items: { include: { rawMaterial: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.purchaseOrder.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { totalAmount: true, currency: true, createdAt: true, status: true, vendorId: true },
    }),
    prisma.vendorPerformance.findMany({
      include: { vendor: { select: { id: true, name: true, code: true } } },
      orderBy: { recordedAt: 'desc' },
      take: 200,
    }),
    prisma.vendor.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true, categories: true, rating: true },
    }),
    prisma.requirementOrder.findMany({
      where: { createdAt: { gte: ninetyDaysAgo } },
      select: { trigger: true, status: true, createdAt: true },
    }),
    prisma.damageReport.findMany({
      where: { createdAt: { gte: ninetyDaysAgo } },
      include: {
        rawMaterial: { select: { name: true } },
        batch: { include: { goodsReceipt: { include: { purchaseOrder: { include: { vendor: { select: { name: true } } } } } } } },
      },
    }),
    prisma.adminNotification.count({ where: { read: false } }),
    prisma.purchaseOrder.findMany({
      where: { notes: { contains: 'Auto-assigned by AI' }, createdAt: { gte: ninetyDaysAgo } },
      select: { id: true, totalAmount: true, currency: true, notes: true, vendorId: true, createdAt: true },
    }),
    prisma.rawMaterial.findMany({
      where: { lastPurchasePrice: { not: null }, active: true },
      select: { id: true, name: true, unit: true, lastPurchasePrice: true, lastPurchasedAt: true, lastPurchasedFrom: true, purchasePrice: true },
      orderBy: { lastPurchasedAt: 'desc' },
      take: 20,
    }),
  ]);

  // ── Procurement spend per vendor ─────────────────────────────────────────
  const spendByVendor: Record<string, { name: string; spend: number; poCount: number }> = {};
  for (const po of allPOs) {
    if (!spendByVendor[po.vendorId]) spendByVendor[po.vendorId] = { name: po.vendor.name, spend: 0, poCount: 0 };
    spendByVendor[po.vendorId].spend += po.totalAmount;
    spendByVendor[po.vendorId].poCount++;
  }
  const topVendorsBySpend = Object.entries(spendByVendor)
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 10)
    .map(([id, v]) => ({ vendorId: id, ...v }));

  // ── Vendor rankings (composite score) ────────────────────────────────────
  const vendorScores: Record<string, { name: string; qualitySum: number; qualityCount: number; onTimeCount: number; totalCount: number; priceSum: number; priceCount: number }> = {};
  for (const p of vendorPerformance) {
    if (!vendorScores[p.vendorId]) vendorScores[p.vendorId] = { name: p.vendor.name, qualitySum: 0, qualityCount: 0, onTimeCount: 0, totalCount: 0, priceSum: 0, priceCount: 0 };
    const vs = vendorScores[p.vendorId];
    vs.totalCount++;
    if (p.qualityRating) { vs.qualitySum += p.qualityRating; vs.qualityCount++; }
    if (p.deliveredOnTime != null) { if (p.deliveredOnTime) vs.onTimeCount++; }
    if (p.pricingScore) { vs.priceSum += p.pricingScore; vs.priceCount++; }
  }
  const vendorRankings = Object.entries(vendorScores).map(([id, v]) => ({
    vendorId: id, name: v.name,
    avgQuality: v.qualityCount ? Math.round((v.qualitySum / v.qualityCount) * 10) / 10 : null,
    onTimePct: v.totalCount ? Math.round((v.onTimeCount / v.totalCount) * 100) : null,
    avgPricingScore: v.priceCount ? Math.round((v.priceSum / v.priceCount) * 10) / 10 : null,
    totalPOs: v.totalCount,
  })).sort((a, b) => (b.avgQuality ?? 0) - (a.avgQuality ?? 0));

  // ── Damage by vendor ─────────────────────────────────────────────────────
  const damageByVendor: Record<string, { name: string; totalDamaged: number; reports: number }> = {};
  for (const d of damageReports) {
    const vendorName = d.batch?.goodsReceipt?.purchaseOrder?.vendor?.name ?? 'Unknown';
    if (!damageByVendor[vendorName]) damageByVendor[vendorName] = { name: vendorName, totalDamaged: 0, reports: 0 };
    damageByVendor[vendorName].totalDamaged += d.qtyDamaged;
    damageByVendor[vendorName].reports++;
  }
  const topDamagedVendors = Object.values(damageByVendor).sort((a, b) => b.totalDamaged - a.totalDamaged).slice(0, 5);

  // ── RO trigger breakdown ─────────────────────────────────────────────────
  const roByTrigger = allROs.reduce((acc: Record<string, number>, ro) => {
    acc[ro.trigger] = (acc[ro.trigger] ?? 0) + 1;
    return acc;
  }, {});

  // ── Monthly spend ─────────────────────────────────────────────────────────
  const monthlySpend: Record<string, number> = {};
  for (const po of allPOs) {
    const key = new Date(po.createdAt).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    monthlySpend[key] = (monthlySpend[key] ?? 0) + po.totalAmount;
  }

  return NextResponse.json({
    summary: {
      totalPOs90Days: allPOs.length,
      totalSpend90Days: allPOs.reduce((s, p) => s + p.totalAmount, 0),
      totalSpend30Days: recentPOs.reduce((s, p) => s + p.totalAmount, 0),
      aiAssignedCount: aiAssignedPOs.length,
      unreadNotifications,
      activeVendors: vendors.length,
      roCount90Days: allROs.length,
      damageReports90Days: damageReports.length,
    },
    topVendorsBySpend,
    vendorRankings,
    topDamagedVendors,
    roByTrigger,
    monthlySpend,
    topMaterials,
  });
}
