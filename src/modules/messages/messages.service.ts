import { headers } from 'next/headers';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { sendEmail, sendSms, smsConfigured } from '@/lib/messaging';
import { DEFAULT_TEMPLATES, MESSAGE_EVENTS, money, renderTemplate, type MessageEvent } from './templates';

type Meta = { event: string; visitId?: string | null; userId?: string | null };
type LogEntry = Meta & {
  channel: 'SMS' | 'EMAIL' | 'WHATSAPP';
  to: string;
  subject?: string | null;
  body: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  error?: string | null;
};

/** The address the portal is served from, for links in a message. */
function siteBase(): string {
  try {
    const h = headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
  } catch { /* no request in scope */ }
  return process.env.APP_URL ?? '';
}

/** Everything a message about a slip can say. */
async function slipVars(visitId: string) {
  const db = await tenantDb();
  const visit = await db.visit.findUnique({
    where: { id: visitId },
    select: {
      slipNo: true,
      b2bNo: true,
      patient: { select: { fullName: true, mrNo: true, mobile: true } },
      partnerLab: { select: { name: true, phone: true } },
      invoice: { select: { netAmount: true, paidAmount: true } },
      orderLines: { where: { status: { not: 'CANCELLED' } }, select: { test: { select: { name: true } } } },
      tenant: { select: { name: true, code: true } },
    },
  });
  if (!visit) return null;
  const net = Number(visit.invoice?.netAmount ?? 0);
  const paid = Number(visit.invoice?.paidAmount ?? 0);
  return {
    mobile: visit.patient.mobile,
    partnerPhone: visit.partnerLab?.phone ?? null,
    values: {
      patient: visit.patient.fullName,
      mr: visit.patient.mrNo,
      slip: visit.slipNo,
      lab: visit.tenant.name,
      code: visit.tenant.code,
      link: `${siteBase()}/portal?lab=${encodeURIComponent(visit.tenant.code)}`,
      tests: visit.orderLines.map((l) => l.test.name).join(', '),
      amount: money(net),
      due: money(Math.max(0, net - paid)),
      partner: visit.partnerLab?.name ?? '',
      ref: visit.b2bNo ?? '',
    },
  };
}

export const messagesService = {
  /** Every message, with the lab's wording where it has saved one. */
  async templates() {
    const rows = await (await tenantDb()).messageTemplate.findMany({});
    return MESSAGE_EVENTS.map((event) => {
      const row = rows.find((r) => r.event === event);
      return { event, enabled: row?.enabled ?? false, body: row?.body ?? DEFAULT_TEMPLATES[event], custom: Boolean(row) };
    });
  },

  async template(event: MessageEvent) {
    const row = await (await tenantDb()).messageTemplate.findFirst({ where: { event } });
    return { enabled: row?.enabled ?? false, body: row?.body ?? DEFAULT_TEMPLATES[event], custom: Boolean(row) };
  },

  async saveTemplates(list: { event: MessageEvent; enabled: boolean; body: string }[], userId: string) {
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    await db.$transaction(async (tx) => {
      for (const t of list) {
        await tx.messageTemplate.upsert({
          where: { tenantId_event: { tenantId, event: t.event } },
          create: { tenantId, event: t.event, enabled: t.enabled, body: t.body },
          update: { enabled: t.enabled, body: t.body },
        });
      }
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, entity: 'Tenant', entityId: tenantId, action: 'MESSAGE_TEMPLATES_UPDATE', after: JSON.stringify(list) },
      });
    });
  },

  /** Write one line to the message log. A log that fails must never fail the send. */
  async log(entry: LogEntry) {
    try {
      await (await tenantDb()).messageLog.create({
        data: {
          tenantId: await currentTenantId(),
          channel: entry.channel,
          event: entry.event,
          to: entry.to,
          subject: entry.subject ?? null,
          body: entry.body,
          status: entry.status,
          error: entry.error ? entry.error.slice(0, 300) : null,
          visitId: entry.visitId ?? null,
          userId: entry.userId ?? null,
        },
      });
    } catch (e) {
      console.error('[messages] could not log', e);
    }
  },

  async sendLoggedSms(to: string, body: string, meta: Meta): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await sendSms(to, body);
      await this.log({ ...meta, channel: 'SMS', to, body, status: 'SENT' });
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'The SMS could not be sent.';
      await this.log({ ...meta, channel: 'SMS', to, body, status: 'FAILED', error });
      return { ok: false, error };
    }
  },

  async sendLoggedEmail(input: Parameters<typeof sendEmail>[0], meta: Meta): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await sendEmail(input);
      await this.log({ ...meta, channel: 'EMAIL', to: input.to, subject: input.subject, body: input.text, status: 'SENT' });
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'The email could not be sent.';
      await this.log({ ...meta, channel: 'EMAIL', to: input.to, subject: input.subject, body: input.text, status: 'FAILED', error });
      return { ok: false, error };
    }
  },

  /**
   * The automatic message for something that just happened on a slip — sent
   * only when the lab has switched that message on. It never throws: a booking
   * or a payment must not fail because an SMS gateway is down. When it cannot
   * go, the log says why.
   */
  async notify(event: Exclude<MessageEvent, 'WHATSAPP_REPORT'>, visitId: string, extra: Record<string, string> = {}, userId?: string) {
    try {
      const tpl = await this.template(event);
      if (!tpl.enabled) return;
      const vars = await slipVars(visitId);
      if (!vars) return;
      const body = renderTemplate(tpl.body, { ...vars.values, ...extra });
      const to = event === 'B2B_RECEIVED' ? vars.partnerPhone : vars.mobile;
      const meta = { event, visitId, userId: userId ?? null };
      if (!to) {
        await this.log({ ...meta, channel: 'SMS', to: '—', body, status: 'SKIPPED', error: event === 'B2B_RECEIVED' ? 'The partner lab has no phone number.' : 'The patient has no mobile number.' });
        return;
      }
      if (!smsConfigured()) {
        await this.log({ ...meta, channel: 'SMS', to, body, status: 'SKIPPED', error: 'SMS is not set up.' });
        return;
      }
      await this.sendLoggedSms(to, body, meta);
    } catch (e) {
      console.error('[messages] notify failed', e);
    }
  },
};
