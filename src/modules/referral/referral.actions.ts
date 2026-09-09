'use server';

import { z } from 'zod';
import { requirePermission } from '@/core/rbac/guard';
import { referralService, type DoctorCommission, type PartnerLabRow } from './referral.service';

export type { DoctorCommission, PartnerLabRow };

const partnerLabSchema = z.object({
  name: z.string().min(2).max(120),
  direction: z.enum(['INWARD', 'OUTWARD']),
  phone: z.string().max(40).optional().or(z.literal('').transform(() => undefined)),
});

export async function getReferralAction(): Promise<{ doctors: DoctorCommission[]; partnerLabs: PartnerLabRow[] }> {
  const user = await requirePermission('finance.view');
  if (!user.branchId) return { doctors: [], partnerLabs: [] };
  const [doctors, partnerLabs] = await Promise.all([
    referralService.doctorCommissions(user.branchId),
    referralService.listPartnerLabs(),
  ]);
  return { doctors, partnerLabs };
}

/**
 * Settling a payable is money going out, so it needs a money-out permission.
 * This was gated on finance.view — a *read* permission that Manager holds —
 * which let anyone who could look at the finance page write off a payable.
 */
export async function settleDoctorAction(
  doctorId: string,
  expected: number,
): Promise<{ ok: true; settled: number } | { ok: false; error: string; total?: number }> {
  const user = await requirePermission('commission.pay');
  if (!user.branchId) return { ok: false, error: 'No branch assigned.' };
  const res = await referralService.settleDoctor(doctorId, user.branchId, expected);
  if (res.ok) return { ok: true, settled: res.settled };
  return {
    ok: false,
    total: res.total,
    error: res.reason === 'NOTHING_OWED'
      ? 'Nothing is owed to this doctor right now.'
      : 'The amount owed changed while this page was open. Check the new figure and try again.',
  };
}

export async function createPartnerLabAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('admin.manage');
  const parsed = partnerLabSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };
  await referralService.createPartnerLab(parsed.data);
  return { ok: true };
}
