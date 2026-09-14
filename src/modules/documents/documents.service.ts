import { tenantDb, currentTenantId } from '@/core/db/context';
import { DOCUMENT_TYPES, STARTER_TEMPLATES, fillDocument, type DocumentType } from './templates';

export class DocumentError extends Error {}

const AGE_UNIT: Record<string, string> = { YEARS: 'years', MONTHS: 'months', DAYS: 'days' };
const SCAN_MAX = 5 * 1024 * 1024;
const SCAN_TYPES = /^(image\/(png|jpe?g|webp)|application\/pdf)$/u;

const asType = (t: string): DocumentType => ((DOCUMENT_TYPES as readonly string[]).includes(t) ? (t as DocumentType) : 'OTHER');

async function audit(action: string, entityId: string, userId: string, after: unknown) {
  const tenantId = await currentTenantId();
  await (await tenantDb()).auditLog.create({ data: { tenantId, actorId: userId, entity: 'PatientDocument', entityId, action, after: JSON.stringify(after) } });
}

export const documentsService = {
  // ── Templates ──
  async templates(includeInactive = false) {
    return (await tenantDb()).documentTemplate.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
      select: { id: true, title: true, type: true, body: true, isActive: true, _count: { select: { documents: true } } },
    });
  },

  async saveTemplate(id: string | null, input: { title: string; type: string; body: string; isActive: boolean }, userId: string) {
    const db = await tenantDb();
    const data = { title: input.title.trim(), type: asType(input.type), body: input.body, isActive: input.isActive };
    const row = id
      ? await db.documentTemplate.update({ where: { id }, data, select: { id: true } })
      : await db.documentTemplate.create({ data: { tenantId: await currentTenantId(), ...data }, select: { id: true } });
    const tenantId = await currentTenantId();
    await db.auditLog.create({ data: { tenantId, actorId: userId, entity: 'DocumentTemplate', entityId: row.id, action: id ? 'UPDATE' : 'CREATE', after: JSON.stringify({ title: data.title, type: data.type, isActive: data.isActive }) } });
    return row.id;
  },

  async addStarterTemplates(userId: string) {
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    const existing = new Set((await db.documentTemplate.findMany({ select: { title: true } })).map((t) => t.title));
    let added = 0;
    for (const tpl of STARTER_TEMPLATES) {
      if (existing.has(tpl.title)) continue;
      await db.documentTemplate.create({ data: { tenantId, ...tpl } });
      added++;
    }
    if (added) await db.auditLog.create({ data: { tenantId, actorId: userId, entity: 'DocumentTemplate', entityId: tenantId, action: 'STARTERS', after: JSON.stringify({ added }) } });
    return added;
  },

  // ── Documents ──
  async list(f: { q?: string; type?: string; status?: string; patientId?: string }) {
    const q = f.q?.trim();
    const num = q && /^\d+$/u.test(q) ? Number(q) : null;
    return (await tenantDb()).patientDocument.findMany({
      where: {
        ...(f.patientId ? { patientId: f.patientId } : {}),
        ...(f.type && (DOCUMENT_TYPES as readonly string[]).includes(f.type) ? { type: f.type } : {}),
        ...(f.status === 'DRAFT' || f.status === 'FINAL' ? { status: f.status } : {}),
        ...(q ? {
          OR: [
            ...(num != null ? [{ docNo: num }] : []),
            { title: { contains: q } },
            { patient: { fullName: { contains: q } } },
            { patient: { mrNo: { contains: q } } },
          ],
        } : {}),
      },
      orderBy: { docNo: 'desc' },
      take: 200,
      select: {
        id: true, docNo: true, title: true, type: true, status: true, prints: true, createdAt: true, scanSize: true,
        patient: { select: { id: true, fullName: true, mrNo: true } },
      },
    });
  },

  async get(id: string) {
    const db = await tenantDb();
    const doc = await db.patientDocument.findUnique({
      where: { id },
      select: {
        id: true, docNo: true, title: true, type: true, body: true, status: true, prints: true,
        createdAt: true, finalizedAt: true, createdById: true, visitId: true,
        scanFileName: true, scanMimeType: true, scanSize: true,
        patient: { select: { id: true, fullName: true, mrNo: true, age: true, ageUnit: true, sex: true, mobile: true } },
      },
    });
    if (!doc) return null;
    const author = await db.user.findUnique({ where: { id: doc.createdById }, select: { fullName: true } });
    return { ...doc, createdBy: author?.fullName ?? null };
  },

  /**
   * Make a document for a patient. From a template, it is filled in with the
   * patient's details and their booking — the one named, or else their latest —
   * and saved as a draft to check before printing.
   */
  async create(input: { patientId: string; templateId?: string | null; visitId?: string | null; title?: string | null }, userId: string) {
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    const patient = await db.patient.findUnique({ where: { id: input.patientId } });
    if (!patient) throw new DocumentError('Patient not found.');
    const template = input.templateId ? await db.documentTemplate.findUnique({ where: { id: input.templateId } }) : null;
    if (input.templateId && !template) throw new DocumentError('That form no longer exists.');
    if (!template && !input.title?.trim()) throw new DocumentError('Give the document a title.');

    const visit = await db.visit.findFirst({
      where: { patientId: patient.id, ...(input.visitId ? { id: input.visitId } : {}), status: { not: 'CANCELLED' } },
      orderBy: { bookedAt: 'desc' },
      select: { id: true, slipNo: true, doctor: { select: { name: true } }, orderLines: { where: { status: { not: 'CANCELLED' } }, select: { test: { select: { name: true } } } } },
    });
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const vars = {
      patient: patient.fullName,
      mr: patient.mrNo,
      age: patient.age != null ? `${patient.age} ${AGE_UNIT[patient.ageUnit] ?? ''}`.trim() : '',
      sex: patient.sex ? patient.sex.charAt(0) + patient.sex.slice(1).toLowerCase() : '',
      mobile: patient.mobile ?? '',
      cnic: patient.cnic ? `${patient.cnic.slice(0, 5)}-${patient.cnic.slice(5, 12)}-${patient.cnic.slice(12)}` : '',
      address: patient.address ?? '',
      date: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()),
      lab: tenant?.name ?? '',
      slip: visit?.slipNo ?? '',
      doctor: visit?.doctor?.name ?? '',
      tests: visit ? visit.orderLines.map((l) => l.test.name).join(', ') : '',
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const created = await db.$transaction(async (tx) => {
          const last = await tx.patientDocument.findFirst({ where: { tenantId }, orderBy: { docNo: 'desc' }, select: { docNo: true } });
          return tx.patientDocument.create({
            data: {
              tenantId, docNo: (last?.docNo ?? 0) + 1, patientId: patient.id, visitId: visit?.id ?? null,
              templateId: template?.id ?? null,
              title: template?.title ?? input.title!.trim(),
              type: template ? asType(template.type) : 'OTHER',
              body: template ? fillDocument(template.body, vars) : '',
              createdById: userId,
            },
            select: { id: true, docNo: true },
          });
        });
        await audit('CREATE', created.id, userId, { docNo: created.docNo, patient: patient.mrNo, template: template?.title ?? null });
        return created.id;
      } catch (e) {
        // Two documents made at the same moment can race for a number; take the next one.
        if (attempt < 2 && e instanceof Error && /Unique constraint/i.test(e.message)) continue;
        throw e;
      }
    }
    throw new DocumentError('The document could not be numbered. Try again.');
  },

  async update(id: string, input: { title: string; body: string }, userId: string) {
    const db = await tenantDb();
    const doc = await db.patientDocument.findUnique({ where: { id }, select: { status: true } });
    if (!doc) throw new DocumentError('Document not found.');
    if (doc.status === 'FINAL') throw new DocumentError('A final document cannot be changed. Make a new one instead.');
    await db.patientDocument.update({ where: { id }, data: { title: input.title.trim(), body: input.body } });
    await audit('UPDATE', id, userId, { title: input.title.trim() });
  },

  async finalize(id: string, userId: string) {
    const db = await tenantDb();
    const doc = await db.patientDocument.findUnique({ where: { id }, select: { status: true, body: true } });
    if (!doc) throw new DocumentError('Document not found.');
    if (doc.status === 'FINAL') return;
    if (!doc.body.trim()) throw new DocumentError('Write the document before making it final.');
    await db.patientDocument.update({ where: { id }, data: { status: 'FINAL', finalizedAt: new Date() } });
    await audit('FINALIZE', id, userId, {});
  },

  async printed(id: string) {
    await (await tenantDb()).patientDocument.update({ where: { id }, data: { prints: { increment: 1 } } });
  },

  async remove(id: string, userId: string) {
    const db = await tenantDb();
    const doc = await db.patientDocument.findUnique({ where: { id }, select: { status: true, docNo: true, title: true } });
    if (!doc) return;
    if (doc.status === 'FINAL') throw new DocumentError('A final document is kept. Only a draft can be deleted.');
    await db.patientDocument.delete({ where: { id } });
    await audit('DELETE', id, userId, doc);
  },

  /** The signed paper, scanned or photographed back onto the document. */
  async attachScan(id: string, file: File, userId: string) {
    if (file.size === 0) throw new DocumentError('That file is empty.');
    if (file.size > SCAN_MAX) throw new DocumentError('Files can be up to 5 MB.');
    if (!SCAN_TYPES.test(file.type)) throw new DocumentError('Attach a photo (JPG, PNG) or a PDF.');
    const db = await tenantDb();
    const doc = await db.patientDocument.findUnique({ where: { id }, select: { id: true } });
    if (!doc) throw new DocumentError('Document not found.');
    const name = file.name.replace(/[^\w.\- ()]/gu, '_').slice(0, 120) || 'scan';
    await db.patientDocument.update({
      where: { id },
      data: { scanFileName: name, scanMimeType: file.type, scanSize: file.size, scanData: Buffer.from(await file.arrayBuffer()) },
    });
    await audit('SCAN', id, userId, { fileName: name, size: file.size });
  },

  async removeScan(id: string, userId: string) {
    await (await tenantDb()).patientDocument.update({ where: { id }, data: { scanFileName: null, scanMimeType: null, scanSize: null, scanData: null } });
    await audit('SCAN_REMOVED', id, userId, {});
  },

  async scan(id: string) {
    return (await tenantDb()).patientDocument.findUnique({ where: { id }, select: { scanFileName: true, scanMimeType: true, scanData: true } });
  },

  /** The letterhead a printed document carries — the lab's, with its first branch's address. */
  async letterhead() {
    const db = await tenantDb();
    const [t, b] = await Promise.all([
      db.tenant.findUniqueOrThrow({ where: { id: await currentTenantId() }, select: { name: true, tagline: true, logoDataUrl: true, licenseNo: true, email: true } }),
      db.branch.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { name: true, address: true, phone: true } }),
    ]);
    return {
      labName: t.name, tagline: t.tagline, logoDataUrl: t.logoDataUrl, licenseNo: t.licenseNo, email: t.email, footerNote: null,
      branchName: b?.name ?? '', branchAddress: b?.address ?? null, branchPhone: b?.phone ?? null,
    };
  },
};
