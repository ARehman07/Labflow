'use server';

import { currentUser } from '@/core/rbac/guard';
import { tenantDb } from '@/core/db/context';

export interface NotificationDTO {
  id: string;
  message: string;
  link: string | null;
  kind: string;
  isRead: boolean;
  at: string;
}

/** The latest notifications for whoever is signed in, and how many are unread. */
export async function getNotificationsAction(): Promise<{ items: NotificationDTO[]; unread: number }> {
  const user = await currentUser();
  const db = await tenantDb();
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { at: 'desc' }, take: 30 }),
    db.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  return {
    unread,
    items: items.map((n) => ({ id: n.id, message: n.message, link: n.link, kind: n.kind, isRead: n.isRead, at: n.at.toISOString() })),
  };
}

export async function markNotificationReadAction(id: string): Promise<void> {
  const user = await currentUser();
  await (await tenantDb()).notification.updateMany({ where: { id, userId: user.id }, data: { isRead: true } });
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await currentUser();
  await (await tenantDb()).notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
}
