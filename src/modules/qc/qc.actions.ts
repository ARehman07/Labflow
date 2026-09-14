'use server';

import { z } from 'zod';
import { can, requirePermission } from '@/core/rbac/guard';
import { qcService, QcError } from './qc.service';

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown, fallback: string) => ({ ok: false as const, error: e instanceof QcError ? e.message : fallback });

async function mayView() {
  return (await can('qc.manage')) || (await can('result.enter')) || (await can('result.approve'));
}

export type QcMaterialDTO = Awaited<ReturnType<typeof qcService.listMaterials>>[number];
export type QcRunDTO = Awaited<ReturnType<typeof qcService.runs>>[number];

export async function listQcMaterialsAction(includeInactive = false): Promise<QcMaterialDTO[]> {
  if (!(await mayView())) return [];
  return qcService.listMaterials(includeInactive);
}

export async function qcParametersAction() {
  await requirePermission('qc.manage');
  return qcService.numericParameters();
}

export async function qcRunsAction(materialId: string): Promise<QcRunDTO[]> {
  if (!(await mayView())) return [];
  return qcService.runs(materialId);
}

const materialSchema = z.object({
  parameterId: z.string().min(1, 'Choose the parameter this control is for.'),
  name: z.string().trim().min(2, 'Enter the control material name').max(80),
  level: z.string().trim().min(1, 'Enter the level, e.g. Normal or High').max(30),
  lotNo: z.string().trim().max(40).optional().transform((s) => s || undefined),
  mean: z.coerce.number().refine(Number.isFinite, 'Enter the target mean'),
  sd: z.coerce.number().positive('The SD must be greater than zero.'),
  expiresAt: z.string().optional().transform((s) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : undefined)),
});

export async function createQcMaterialAction(input: unknown): Promise<Res<{ id: string }>> {
  await requirePermission('qc.manage');
  const parsed = materialSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid control' };
  try {
    return { ok: true, id: await qcService.createMaterial(parsed.data) };
  } catch (e) {
    return fail(e, 'The control could not be saved.');
  }
}

export async function setQcMaterialActiveAction(id: string, isActive: boolean): Promise<Res> {
  await requirePermission('qc.manage');
  await qcService.setActive(id, isActive);
  return { ok: true };
}

export async function recordQcRunAction(materialId: string, value: number, note?: string): Promise<Res<{ rejected: boolean; warnings: string[]; rejections: string[]; z: number }>> {
  const user = await requirePermission('result.enter');
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter the control value.' };
  try {
    const r = await qcService.recordRun(materialId, value, note?.trim().slice(0, 200) || undefined, user.id);
    return { ok: true, ...r };
  } catch (e) {
    return fail(e, 'The run could not be saved.');
  }
}
