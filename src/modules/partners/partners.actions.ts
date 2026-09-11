'use server';

import { z } from 'zod';
import { can, requirePermission } from '@/core/rbac/guard';
import { partnersService, PartnerError } from './partners.service';

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({ ok: false, error: e instanceof PartnerError ? e.message : fallback });

export type PartnerRowDTO = Awaited<ReturnType<typeof partnersService.list>>[number];
export type PartnerDetailDTO = NonNullable<Awaited<ReturnType<typeof partnersService.detail>>>;
export type PortalLoginDTO = Awaited<ReturnType<typeof partnersService.portalLogins>>[number];

async function mayView() {
  return (await can('partner.manage')) || (await can('finance.view'));
}

export async function listPartnersAction(): Promise<PartnerRowDTO[]> {
  if (!(await mayView())) return [];
  return partnersService.list(true);
}

/** For the booking screen: partner labs that send samples here. */
export async function listInwardPartnersAction(): Promise<{ id: string; name: string; accountType: string; rateGroupId: string | null }[]> {
  if (!(await can('visit.create'))) return [];
  const rows = await partnersService.list(false);
  return rows.filter((r) => r.direction === 'INWARD').map((r) => ({ id: r.id, name: r.name, accountType: r.accountType, rateGroupId: r.rateGroupId }));
}

/** For the lab board: reference labs tests can be sent out to. */
export async function listOutwardPartnersAction(): Promise<{ id: string; name: string }[]> {
  if (!(await can('workflow.advance'))) return [];
  const rows = await partnersService.list(false);
  return rows.filter((r) => r.direction === 'OUTWARD').map((r) => ({ id: r.id, name: r.name }));
}

export async function getPartnerAction(id: string): Promise<PartnerDetailDTO | null> {
  if (!(await mayView())) return null;
  return partnersService.detail(id);
}

const blank = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);
const partnerSchema = z.object({
  name: z.string().trim().min(2, 'Enter the lab name').max(120),
  direction: z.enum(['INWARD', 'OUTWARD']),
  accountType: z.enum(['PREPAID', 'CASH', 'POSTPAID']).default('CASH'),
  rateGroupId: z.string().optional().transform(blank),
  phone: z.string().max(40).optional().transform(blank),
  contactPerson: z.string().max(80).optional().transform(blank),
  email: z.string().max(120).optional().transform(blank),
});

export async function savePartnerAction(id: string | null, input: unknown): Promise<Res<{ id: string }>> {
  await requirePermission('partner.manage');
  const parsed = partnerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid partner lab' };
  try {
    return { ok: true, id: await partnersService.save(id, parsed.data) };
  } catch (e) {
    return fail(e, 'The partner lab could not be saved.');
  }
}

export async function setPartnerActiveAction(id: string, isActive: boolean): Promise<Res> {
  await requirePermission('partner.manage');
  await partnersService.setActive(id, isActive);
  return { ok: true };
}

const txSchema = z.object({
  type: z.enum(['PAYMENT', 'TOPUP', 'REFUND', 'ADJUSTMENT']),
  amount: z.coerce.number().refine((n) => Number.isFinite(n) && n !== 0, 'Enter an amount'),
  accountId: z.string().optional().transform(blank),
  note: z.string().max(200).optional().transform(blank),
});

export async function recordPartnerTransactionAction(partnerId: string, input: unknown): Promise<Res<{ balance: number }>> {
  const user = await requirePermission('partner.manage');
  const parsed = txSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid amount' };
  try {
    const totals = await partnersService.recordTransaction(partnerId, parsed.data, user.id);
    return { ok: true, balance: totals.balance };
  } catch (e) {
    return fail(e, 'The payment could not be recorded.');
  }
}

export async function listPortalLoginsAction(): Promise<PortalLoginDTO[]> {
  await requirePermission('user.manage');
  return partnersService.portalLogins();
}

const loginSchema = z.object({
  kind: z.enum(['PARTNER', 'DOCTOR']),
  entityId: z.string().min(1, 'Choose who this login is for'),
  username: z.string().trim().min(3, 'At least 3 characters').max(40).regex(/^[a-zA-Z0-9_.]+$/, 'Letters, numbers, _ and . only'),
  fullName: z.string().max(80).optional(),
});

export async function createPortalLoginAction(input: unknown): Promise<Res<{ username: string; tempPassword: string }>> {
  const user = await requirePermission('user.manage');
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid login' };
  try {
    const r = await partnersService.createPortalLogin(parsed.data, user.id);
    return { ok: true, ...r };
  } catch (e) {
    return fail(e, 'The login could not be created.');
  }
}
