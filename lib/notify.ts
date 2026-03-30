import { prisma } from '@/lib/prisma';

type NotifyParams = {
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedModel?: string;
  relatedId?: string;
};

/** Send an in-app notification to a specific user. Non-fatal — never blocks the caller. */
export async function notify(params: NotifyParams) {
  try {
    await prisma.notification.create({
      data: {
        userId:       params.userId,
        type:         params.type,
        title:        params.title,
        message:      params.message,
        relatedModel: params.relatedModel ?? null,
        relatedId:    params.relatedId ?? null,
      },
    });
  } catch {
    console.warn('[notify] Failed:', params.title);
  }
}

/** Send notifications to multiple users at once. Non-fatal. */
export async function notifyMany(userIds: string[], params: Omit<NotifyParams, 'userId'>) {
  try {
    if (userIds.length === 0) return;
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type:         params.type,
        title:        params.title,
        message:      params.message,
        relatedModel: params.relatedModel ?? null,
        relatedId:    params.relatedId ?? null,
      })),
    });
  } catch {
    console.warn('[notifyMany] Failed:', params.title);
  }
}
