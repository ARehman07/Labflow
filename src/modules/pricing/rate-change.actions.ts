'use server';

import { z } from 'zod';
import { requirePermission } from '@/core/rbac/guard';
import { rateChangeService, type RateChangeRow } from './rate-change.service';
import { ROUND_STEPS } from './adjust';

const id = z.string().nullish().transform((v) => v || null);

const schema = z.object({
  scope: z.enum(['BRANCH', 'RATE_GROUP']),
  branchId: id,
  rateGroupId: id,
  departmentId: id,
  groupId: id,
  status: z.enum(['ACTIVE', 'ALL']),
  pct: z.coerce.number().min(-90, 'Prices cannot drop by more than 90%').max(500, 'Prices cannot rise by more than 500%'),
  roundTo: z.coerce.number().refine((n) => (ROUND_STEPS as readonly number[]).includes(n), 'Choose how to round'),
});

export async function previewRateChangeAction(input: unknown): Promise<{ ok: true; rows: RateChangeRow[] } | { ok: false; error: string }> {
  await requirePermission('admin.manage');
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid choices' };
  return { ok: true, rows: await rateChangeService.preview(parsed.data) };
}

export async function applyRateChangeAction(input: unknown): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const user = await requirePermission('admin.manage');
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid choices' };
  if (parsed.data.pct === 0) return { ok: false, error: 'Enter the percentage to change prices by.' };
  if (parsed.data.scope === 'RATE_GROUP' && !parsed.data.rateGroupId) return { ok: false, error: 'Choose a rate group.' };
  try {
    return { ok: true, count: await rateChangeService.apply(parsed.data, user.id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'The prices could not be changed.' };
  }
}
