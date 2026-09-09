'use server';

import { requirePermission } from '@/core/rbac/guard';
import { settingsService, letterheadService, type LabPolicy, type LabLetterhead } from './settings.service';
import { labPolicySchema, letterheadSchema } from './settings.schema';

export type { LabPolicy, LabLetterhead };

export async function getLabPolicyAction(): Promise<LabPolicy> {
  await requirePermission('settings.manage');
  return settingsService.getPolicy();
}

export async function updateLabPolicyAction(
  input: unknown,
): Promise<{ ok: true; policy: LabPolicy } | { ok: false; error: string }> {
  const user = await requirePermission('settings.manage');
  const parsed = labPolicySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid policy' };
  const policy = await settingsService.updatePolicy(parsed.data, user.id);
  return { ok: true, policy };
}

export async function getLetterheadAction(): Promise<LabLetterhead> {
  await requirePermission('settings.manage');
  return letterheadService.get();
}

export async function updateLetterheadAction(
  input: unknown,
): Promise<{ ok: true; letterhead: LabLetterhead } | { ok: false; error: string }> {
  const user = await requirePermission('settings.manage');
  const parsed = letterheadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };
  const letterhead = await letterheadService.update(parsed.data, user.id);
  return { ok: true, letterhead };
}
