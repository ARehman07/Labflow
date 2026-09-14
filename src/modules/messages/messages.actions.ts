'use server';

import { z } from 'zod';
import { can, requirePermission } from '@/core/rbac/guard';
import { tenantDb } from '@/core/db/context';
import { messagesService } from './messages.service';
import { MESSAGE_EVENTS } from './templates';

export type MessageTemplateDTO = Awaited<ReturnType<typeof messagesService.templates>>[number];

export interface MessageLogDTO {
  id: string;
  at: string;
  channel: string;
  event: string;
  to: string;
  subject: string | null;
  body: string;
  status: string;
  error: string | null;
  by: string | null;
}

const templatesSchema = z.array(z.object({
  event: z.enum(MESSAGE_EVENTS),
  enabled: z.boolean(),
  body: z.string().trim().min(5, 'A message cannot be empty').max(600, 'Keep a message under 600 characters'),
})).max(MESSAGE_EVENTS.length);

export async function saveMessageTemplatesAction(
  input: unknown,
): Promise<{ ok: true; templates: MessageTemplateDTO[] } | { ok: false; error: string }> {
  const user = await requirePermission('settings.manage');
  const parsed = templatesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid messages' };
  await messagesService.saveTemplates(parsed.data, user.id);
  return { ok: true, templates: await messagesService.templates() };
}

const fmt = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);

/** The message log. It carries patients' numbers, so it is for the owner and admins. */
export async function listMessageLogAction(filter: { from?: string; to?: string; channel?: string; status?: string }): Promise<MessageLogDTO[]> {
  if (!(await can('settings.manage')) && !(await can('admin.manage'))) return [];
  const db = await tenantDb();
  const from = filter.from ? new Date(`${filter.from}T00:00:00`) : undefined;
  const to = filter.to ? new Date(`${filter.to}T23:59:59.999`) : undefined;
  const channel = filter.channel === 'SMS' || filter.channel === 'EMAIL' || filter.channel === 'WHATSAPP' ? filter.channel : undefined;
  const status = filter.status === 'SENT' || filter.status === 'FAILED' || filter.status === 'SKIPPED' ? filter.status : undefined;
  const rows = await db.messageLog.findMany({
    where: {
      ...(from || to ? { at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(channel ? { channel } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { at: 'desc' },
    take: 300,
  });
  const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => Boolean(x)))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u) => [u.id, u.fullName]));
  return rows.map((r) => ({
    id: r.id, at: fmt(r.at), channel: r.channel, event: r.event, to: r.to, subject: r.subject,
    body: r.body, status: r.status, error: r.error, by: r.userId ? name.get(r.userId) ?? null : null,
  }));
}
