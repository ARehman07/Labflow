'use server';

import { z } from 'zod';
import { can, requirePermission } from '@/core/rbac/guard';
import { accountsService } from './accounts.service';

export interface PaymentAccountDTO {
  id: string;
  name: string;
  method: 'CASH' | 'CARD' | 'ONLINE';
  isActive: boolean;
}

/** For anyone who takes or returns money: the counter, billing. */
export async function listPaymentAccountsAction(includeInactive = false): Promise<PaymentAccountDTO[]> {
  const allowed = (await can('visit.create')) || (await can('payment.receive')) || (await can('refund.issue')) || (await can('admin.manage'));
  if (!allowed) return [];
  const rows = await accountsService.list(includeInactive);
  return rows.map((r) => ({ id: r.id, name: r.name, method: r.method as PaymentAccountDTO['method'], isActive: r.isActive }));
}

const accountSchema = z.object({
  name: z.string().trim().min(2, 'Enter the account name').max(60),
  method: z.enum(['CASH', 'CARD', 'ONLINE']).default('CASH'),
});

export async function createPaymentAccountAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission('admin.manage');
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid account' };
  try {
    await accountsService.create(parsed.data);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'The account could not be added.' };
  }
}

export async function setPaymentAccountActiveAction(id: string, isActive: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission('admin.manage');
  try {
    await accountsService.setActive(id, isActive);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'The account could not be changed.' };
  }
}
