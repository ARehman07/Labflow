'use server';

import { z } from 'zod';
import { requirePermission } from '@/core/rbac/guard';
import { qcService } from '@/modules/qc/qc.service';
import { analyzersService } from './analyzers.service';

export type AnalyzerDTO = Awaited<ReturnType<typeof analyzersService.list>>[number];
export type AnalyzerMessageDTO = Awaited<ReturnType<typeof analyzersService.messages>>[number];

export async function listAnalyzersAction(): Promise<AnalyzerDTO[]> {
  await requirePermission('admin.manage');
  return analyzersService.list();
}

export async function analyzerParametersAction() {
  await requirePermission('admin.manage');
  return qcService.numericParameters();
}

export async function createAnalyzerAction(name: string): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  await requirePermission('admin.manage');
  const parsed = z.string().trim().min(2, 'Enter the analyzer name').max(60).safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' };
  return { ok: true, key: await analyzersService.create(parsed.data) };
}

export async function setAnalyzerActiveAction(id: string, isActive: boolean) {
  await requirePermission('admin.manage');
  await analyzersService.setActive(id, isActive);
  return { ok: true as const };
}

const mappingsSchema = z.array(z.object({
  code: z.string().trim().min(1).max(30),
  parameterId: z.string().min(1),
})).max(300);

export async function setAnalyzerMappingsAction(analyzerId: string, mappings: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission('admin.manage');
  const parsed = mappingsSchema.safeParse(mappings);
  if (!parsed.success) return { ok: false, error: 'Each mapping needs an instrument code and a parameter.' };
  const codes = parsed.data.map((m) => m.code.toUpperCase());
  if (new Set(codes).size !== codes.length) return { ok: false, error: 'Each instrument code can be mapped only once.' };
  await analyzersService.setMappings(analyzerId, parsed.data);
  return { ok: true };
}

export async function analyzerMessagesAction(analyzerId: string): Promise<AnalyzerMessageDTO[]> {
  await requirePermission('admin.manage');
  return analyzersService.messages(analyzerId);
}
