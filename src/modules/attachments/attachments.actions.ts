'use server';

import { can, currentUser } from '@/core/rbac/guard';
import { tenantDb, currentTenantId } from '@/core/db/context';

export interface AttachmentDTO {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

/** Files kept small: a phone photo of a prescription, a scanned referral letter. */
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/u;

async function mayView() {
  const checks = await Promise.all([can('visit.create'), can('result.enter'), can('result.approve'), can('billing.view'), can('report.print')]);
  return checks.some(Boolean);
}

export async function listAttachmentsAction(visitId: string): Promise<AttachmentDTO[]> {
  if (typeof visitId !== 'string' || !visitId || !(await mayView())) return [];
  const rows = await (await tenantDb()).attachment.findMany({
    where: { visitId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function uploadAttachmentAction(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await can('visit.create')) && !(await can('visit.modify'))) return { ok: false, error: 'You cannot attach files to bookings.' };
  const user = await currentUser();
  const visitId = String(form.get('visitId') ?? '');
  const orderLineId = String(form.get('orderLineId') ?? '') || null;
  const kind = form.get('kind') === 'OUTSOURCE_REPORT' ? 'OUTSOURCE_REPORT' : 'BOOKING';
  const file = form.get('file');
  if (!visitId || !(file instanceof File)) return { ok: false, error: 'Choose a file to attach.' };
  if (file.size === 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'Files can be up to 5 MB.' };
  if (!ALLOWED.test(file.type)) return { ok: false, error: 'Attach a photo (JPG, PNG) or a PDF.' };

  const db = await tenantDb();
  const visit = await db.visit.findUnique({ where: { id: visitId }, select: { id: true } });
  if (!visit) return { ok: false, error: 'Booking not found.' };
  const tenantId = await currentTenantId();
  const name = file.name.replace(/[^\w.\- ()]/gu, '_').slice(0, 120) || 'attachment';
  const created = await db.attachment.create({
    data: {
      tenantId, visitId, orderLineId, kind, fileName: name, mimeType: file.type, size: file.size,
      data: Buffer.from(await file.arrayBuffer()), uploadedById: user.id,
    },
    select: { id: true },
  });
  await db.auditLog.create({
    data: { tenantId, actorId: user.id, entity: 'Attachment', entityId: created.id, action: 'UPLOAD', after: JSON.stringify({ visitId, fileName: name, size: file.size }) },
  });
  return { ok: true };
}

export async function deleteAttachmentAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await can('visit.modify'))) return { ok: false, error: 'You cannot remove attachments.' };
  const user = await currentUser();
  const db = await tenantDb();
  const row = await db.attachment.findUnique({ where: { id }, select: { id: true, fileName: true, visitId: true } });
  if (!row) return { ok: false, error: 'That file was already removed.' };
  await db.attachment.delete({ where: { id } });
  await db.auditLog.create({
    data: { tenantId: await currentTenantId(), actorId: user.id, entity: 'Attachment', entityId: id, action: 'DELETE', before: JSON.stringify(row) },
  });
  return { ok: true };
}
