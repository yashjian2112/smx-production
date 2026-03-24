import { prisma } from '@/lib/prisma';

type NotifType = 'PO_AUTO_ASSIGNED' | 'PRICE_DEVIATION' | 'OVERRIDE_REQUEST' | 'LOW_STOCK';

export async function adminNotify(type: NotifType, title: string, body: string, data?: object) {
  try {
    await prisma.adminNotification.create({ data: { type, title, body, data: data ?? undefined } });
  } catch {
    // Non-fatal — never block the main flow
    console.warn('[adminNotify] Failed to create notification:', title);
  }
}
