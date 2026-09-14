'use server';

import { featureOn } from '@/core/features/features.server';import { can, currentUser } from '@/core/rbac/guard';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { labService } from '@/modules/lab/lab.service';
import { emailConfigured, smsConfigured } from '@/lib/messaging';
import { messagesService } from '@/modules/messages/messages.service';
import { renderTemplate } from '@/modules/messages/templates';
import { aiConfigured } from '@/modules/ai/ai.service';

type Res = { ok: true } | { ok: false; error: string };

async function mayRelease() {
  return (await can('report.print')) || (await can('report.deliver'));
}

/** Which outside services this server can use. */
export async function integrationsStatusAction(): Promise<{ email: boolean; sms: boolean; ai: boolean }> {
  await currentUser();
  return { email: emailConfigured(), sms: smsConfigured(), ai: aiConfigured() && (await featureOn('lab.ai')) };
}

async function visitContact(visitId: string) {
  const db = await tenantDb();
  const [visit, tenant] = await Promise.all([
    db.visit.findUnique({ where: { id: visitId }, select: { slipNo: true, patient: { select: { fullName: true, mrNo: true, email: true, mobile: true } } } }),
    db.tenant.findUnique({ where: { id: await currentTenantId() }, select: { name: true, code: true } }),
  ]);
  return { visit, labName: tenant?.name ?? 'The lab', labCode: tenant?.code ?? '' };
}

/** Email the report as a PDF (made on screen and sent up) with the portal link. */
export async function emailReportAction(visitId: string, pdfBase64: string, portalLink: string): Promise<Res> {
  const user = await currentUser();
  if (!(await mayRelease())) return { ok: false, error: 'You cannot release reports.' };
  if (!emailConfigured()) return { ok: false, error: 'Email is not set up. Add SMTP_HOST, SMTP_USER and SMTP_PASS to the server environment.' };
  const { visit, labName } = await visitContact(visitId);
  if (!visit) return { ok: false, error: 'Booking not found.' };
  if (!visit.patient.email) return { ok: false, error: 'This patient has no email address. Add it in Modify booking or the patient’s record.' };
  const pdf = Buffer.from(String(pdfBase64 ?? ''), 'base64');
  if (pdf.length < 100 || pdf.length > 8 * 1024 * 1024) return { ok: false, error: 'The report file could not be attached.' };
  try {
    const sent = await messagesService.sendLoggedEmail({
      to: visit.patient.email,
      subject: `${labName} — your lab report (slip #${visit.slipNo})`,
      text: `Dear ${visit.patient.fullName},\n\nYour lab report from ${labName} is attached.\nYou can also view it online: ${portalLink}\n\nMR#: ${visit.patient.mrNo}\n\n${labName}`,
      attachments: [{ filename: `Report-${visit.slipNo}-${visit.patient.mrNo}.pdf`, content: pdf, contentType: 'application/pdf' }],
    }, { event: 'REPORT_EMAIL', visitId, userId: user.id });
    if (!sent.ok) return { ok: false, error: sent.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'The email could not be sent.' };
  }
  await labService.releaseVisit(visitId, 'DELIVERED', user.id, 'EMAIL');
  return { ok: true };
}

/** Text the patient that the report is ready, with the portal link. */
export async function smsReportAction(visitId: string, portalLink: string): Promise<Res> {
  const user = await currentUser();
  if (!(await mayRelease())) return { ok: false, error: 'You cannot release reports.' };
  if (!smsConfigured()) return { ok: false, error: 'SMS is not set up. Add SMS_API_URL to the server environment.' };
  const { visit, labName, labCode } = await visitContact(visitId);
  if (!visit?.patient.mobile) return { ok: false, error: 'This patient has no mobile number.' };
  try {
    // Pressed by hand, so it goes whether or not the automatic message is on — in the lab's wording.
    const tpl = await messagesService.template('REPORT_READY');
    const body = renderTemplate(tpl.body, { patient: visit.patient.fullName, lab: labName, slip: visit.slipNo, mr: visit.patient.mrNo, link: portalLink, code: labCode });
    const sent = await messagesService.sendLoggedSms(visit.patient.mobile, body, { event: 'REPORT_READY', visitId, userId: user.id });
    if (!sent.ok) return { ok: false, error: sent.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'The SMS could not be sent.' };
  }
  await labService.releaseVisit(visitId, 'DELIVERED', user.id, 'SMS');
  return { ok: true };
}
