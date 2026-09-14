'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { can, currentUser, requirePermission } from '@/core/rbac/guard';
import { tenantDb } from '@/core/db/context';
import { receptionService } from '@/modules/reception/reception.service';
import { documentsService, DocumentError } from './documents.service';
import { DOCUMENT_TYPES } from './templates';

type Res = { ok: true } | { ok: false; error: string };

const fmt = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
const fail = (e: unknown, fallback: string) => ({ ok: false as const, error: e instanceof DocumentError ? e.message : fallback });

export interface DocTemplateDTO { id: string; title: string; type: string; body: string; isActive: boolean; used: number }
export interface DocumentRowDTO {
  id: string; docNo: number; title: string; type: string; status: string; prints: number; created: string;
  hasScan: boolean; patientId: string; patient: string; mrNo: string;
}
export interface PatientPickDTO { id: string; fullName: string; mrNo: string; mobile: string | null }

async function mayView() {
  return (await can('document.manage')) || (await can('admin.manage'));
}

export async function listDocumentTemplatesAction(includeInactive = false): Promise<DocTemplateDTO[]> {
  if (!(await mayView())) return [];
  return (await documentsService.templates(includeInactive)).map((t) => ({ id: t.id, title: t.title, type: t.type, body: t.body, isActive: t.isActive, used: t._count.documents }));
}

const templateSchema = z.object({
  title: z.string().trim().min(3, 'Give the form a title').max(120),
  type: z.enum(DOCUMENT_TYPES),
  body: z.string().trim().min(10, 'Write the form').max(8000, 'Keep a form under 8,000 characters'),
  isActive: z.boolean(),
});

export async function saveDocumentTemplateAction(id: string | null, input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requirePermission('admin.manage');
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid form' };
  try {
    return { ok: true, id: await documentsService.saveTemplate(id, parsed.data, user.id) };
  } catch (e) {
    return fail(e, 'The form could not be saved.');
  }
}

export async function addStarterTemplatesAction(): Promise<{ ok: true; added: number }> {
  const user = await requirePermission('admin.manage');
  return { ok: true, added: await documentsService.addStarterTemplates(user.id) };
}

export async function listDocumentsAction(f: { q?: string; type?: string; status?: string; patientId?: string }): Promise<DocumentRowDTO[]> {
  if (!(await mayView())) return [];
  return (await documentsService.list(f)).map((d) => ({
    id: d.id, docNo: d.docNo, title: d.title, type: d.type, status: d.status, prints: d.prints, created: fmt(d.createdAt),
    hasScan: d.scanSize != null, patientId: d.patient.id, patient: d.patient.fullName, mrNo: d.patient.mrNo,
  }));
}

export async function searchDocumentPatientsAction(query: string): Promise<PatientPickDTO[]> {
  await requirePermission('document.manage');
  if (String(query ?? '').trim().length < 2) return [];
  return (await receptionService.searchPatients(query)).slice(0, 12).map((p) => ({ id: p.id, fullName: p.fullName, mrNo: p.mrNo, mobile: p.mobile }));
}

export async function getDocumentPatientAction(id: string): Promise<PatientPickDTO | null> {
  await requirePermission('document.manage');
  const p = await (await tenantDb()).patient.findUnique({ where: { id }, select: { id: true, fullName: true, mrNo: true, mobile: true } });
  return p;
}

const createSchema = z.object({
  patientId: z.string().min(1, 'Choose a patient'),
  templateId: z.string().nullish(),
  visitId: z.string().nullish(),
  title: z.string().trim().max(120).nullish(),
});

export async function createDocumentAction(input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requirePermission('document.manage');
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid document' };
  try {
    return { ok: true, id: await documentsService.create(parsed.data, user.id) };
  } catch (e) {
    return fail(e, 'The document could not be made.');
  }
}

const updateSchema = z.object({
  title: z.string().trim().min(3, 'Give the document a title').max(120),
  body: z.string().max(8000, 'Keep a document under 8,000 characters'),
});

export async function updateDocumentAction(id: string, input: unknown): Promise<Res> {
  const user = await requirePermission('document.manage');
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid document' };
  try {
    await documentsService.update(id, parsed.data, user.id);
    revalidatePath(`/documents/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e, 'The document could not be saved.');
  }
}

export async function finalizeDocumentAction(id: string): Promise<Res> {
  const user = await requirePermission('document.manage');
  try {
    await documentsService.finalize(id, user.id);
    revalidatePath(`/documents/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e, 'The document could not be made final.');
  }
}

/** Counted when the print dialog is opened — the closest a browser lets us get to "it was printed". */
export async function markDocumentPrintedAction(id: string): Promise<Res> {
  await requirePermission('document.manage');
  await documentsService.printed(id);
  return { ok: true };
}

export async function deleteDocumentAction(id: string): Promise<Res> {
  const user = await requirePermission('document.manage');
  try {
    await documentsService.remove(id, user.id);
    return { ok: true };
  } catch (e) {
    return fail(e, 'The document could not be deleted.');
  }
}

export async function uploadDocumentScanAction(form: FormData): Promise<Res> {
  const user = await requirePermission('document.manage');
  const id = String(form.get('id') ?? '');
  const file = form.get('file');
  if (!id || !(file instanceof File)) return { ok: false, error: 'Choose a file to attach.' };
  try {
    await documentsService.attachScan(id, file, user.id);
    revalidatePath(`/documents/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e, 'The scan could not be attached.');
  }
}

export async function removeDocumentScanAction(id: string): Promise<Res> {
  const user = await requirePermission('document.manage');
  await documentsService.removeScan(id, user.id);
  revalidatePath(`/documents/${id}`);
  return { ok: true };
}

export async function whoAmIForDocumentsAction() {
  const user = await currentUser();
  return { canManage: await can('document.manage'), canTemplates: await can('admin.manage'), name: user.name ?? null };
}
