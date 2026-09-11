'use server';

import { z } from 'zod';
import { can, requirePermission } from '@/core/rbac/guard';
import { antibioticsService } from './antibiotics.service';

export interface AntibioticDTO { id: string; name: string; isActive: boolean }

export async function listAntibioticsAction(includeInactive = false): Promise<AntibioticDTO[]> {
  if (!(await can('result.enter')) && !(await can('admin.manage'))) return [];
  return antibioticsService.list(includeInactive);
}

export async function addAntibioticAction(name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission('admin.manage');
  const parsed = z.string().trim().min(2, 'Enter the antibiotic name').max(60).safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid name' };
  try {
    await antibioticsService.add(parsed.data);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'The antibiotic could not be added.' };
  }
}

export async function setAntibioticActiveAction(id: string, isActive: boolean): Promise<{ ok: true }> {
  await requirePermission('admin.manage');
  await antibioticsService.setActive(id, isActive);
  return { ok: true };
}
