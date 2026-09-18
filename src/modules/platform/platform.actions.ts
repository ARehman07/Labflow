'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isLockedOut, recordFailure, recordSuccess } from '@/core/auth/rate-limit';
import { platformConfigured, verifyPlatformAdmin } from '@/core/platform/admins';
import { PLATFORM_COOKIE, requirePlatformAdmin } from '@/core/platform/session';
import { PLATFORM_SESSION_MS, platformKey, signPlatformToken } from '@/core/platform/token';
import { platformService, PlatformError } from './platform.service';
import { LAB_CODE } from './rules';

type Res = { ok: true } | { ok: false; error: string };
const fail = (e: unknown, fallback: string) => ({ ok: false as const, error: e instanceof PlatformError ? e.message : fallback });
const dateOrNull = z.string().trim().refine((s) => s === '' || !Number.isNaN(Date.parse(`${s}T00:00:00`)), 'Enter a valid date')
  .transform((s) => (s ? new Date(`${s}T00:00:00`) : null));

export async function platformLoginAction(_prev: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  if (!platformConfigured()) return { error: 'No platform admins are set up. Add PLATFORM_ADMINS to the server environment.' };
  const username = String(form.get('username') ?? '');
  const password = String(form.get('password') ?? '');
  const key = `platform:${username.trim().toLowerCase()}`;
  if (isLockedOut(key)) return { error: 'Too many attempts. Try again in 15 minutes.' };
  const admin = await verifyPlatformAdmin(username, password);
  if (!admin) {
    recordFailure(key);
    return { error: 'Wrong username or password.' };
  }
  recordSuccess(key);
  cookies().set(PLATFORM_COOKIE, signPlatformToken(admin, platformKey()), {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/platform', maxAge: PLATFORM_SESSION_MS / 1000,
  });
  redirect('/platform');
}

export async function platformLogoutAction() {
  cookies().set(PLATFORM_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/platform', maxAge: 0 });
  redirect('/platform/login');
}

const newLabSchema = z.object({
  name: z.string().trim().min(2, 'Enter the lab name').max(120),
  code: z.string().trim().toLowerCase().regex(LAB_CODE, 'Lab code: 3–30 lowercase letters, numbers or hyphens'),
  branchName: z.string().trim().min(2, 'Enter the first branch name').max(80),
  branchAddress: z.string().trim().max(200).optional().transform((v) => v || undefined),
  branchPhone: z.string().trim().max(40).optional().transform((v) => v || undefined),
  ownerName: z.string().trim().min(2, 'Enter the owner’s name').max(120),
  ownerUsername: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/u, 'Owner username: 3–40 lowercase letters, numbers, dots, dashes or underscores'),
});

export async function createLabAction(input: unknown): Promise<{ ok: true; lab: { id: string; code: string; ownerUsername: string; password: string } } | { ok: false; error: string }> {
  const admin = await requirePlatformAdmin();
  const parsed = newLabSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details' };
  try {
    return { ok: true, lab: await platformService.createLab(parsed.data, admin) };
  } catch (e) {
    return fail(e, 'The lab could not be created.');
  }
}

export async function setLabActiveAction(id: string, isActive: boolean): Promise<Res> {
  const admin = await requirePlatformAdmin();
  try {
    await platformService.setActive(id, isActive === true, admin);
    return { ok: true };
  } catch (e) {
    return fail(e, 'The lab could not be updated.');
  }
}

const planSchema = z.object({
  planName: z.string().trim().max(60).transform((v) => v || null),
  monthlyFee: z.coerce.number().min(0, 'The fee cannot be negative').max(10_000_000),
  graceDays: z.coerce.number().int('Whole days').min(0).max(60, 'At most 60 grace days'),
  maxUsers: z.union([z.literal(''), z.coerce.number().int('A whole number').min(1, 'At least 1').max(1000)]).transform((v) => (v === '' ? null : v)),
  paidUntil: dateOrNull,
});

export async function updatePlanAction(id: string, input: unknown): Promise<Res> {
  const admin = await requirePlatformAdmin();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the plan' };
  try {
    await platformService.updatePlan(id, parsed.data, admin);
    return { ok: true };
  } catch (e) {
    return fail(e, 'The plan could not be saved.');
  }
}

const requiredDate = z.string().trim().refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00`)), 'Enter a valid date')
  .transform((s) => new Date(`${s}T00:00:00`));

/** A payment covers the days the admin picks: from and until, both inclusive. */
const paymentSchema = z.object({
  amount: z.coerce.number().positive('Enter the amount paid').max(100_000_000),
  from: requiredDate,
  until: requiredDate,
  method: z.string().trim().max(40).optional().transform((v) => v || undefined),
  reference: z.string().trim().max(80).optional().transform((v) => v || undefined),
  note: z.string().trim().max(200).optional().transform((v) => v || undefined),
})
  .refine((p) => p.until >= p.from, { message: 'The period cannot end before it starts', path: ['until'] })
  .refine((p) => p.until.getTime() - p.from.getTime() <= 3 * 366 * 86_400_000, { message: 'A payment covers at most 3 years', path: ['until'] });

export async function recordLabPaymentAction(id: string, input: unknown): Promise<{ ok: true; paidUntil: string } | { ok: false; error: string }> {
  const admin = await requirePlatformAdmin();
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the payment' };
  try {
    const period = await platformService.recordPayment(id, parsed.data, admin);
    return { ok: true, paidUntil: period.to.toISOString() };
  } catch (e) {
    return fail(e, 'The payment could not be recorded.');
  }
}

const overrideSchema = z.object({ mode: z.enum(['NONE', 'ACTIVE', 'READ_ONLY']), until: dateOrNull });

export async function setAccessOverrideAction(id: string, input: unknown): Promise<Res> {
  const admin = await requirePlatformAdmin();
  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the access choice' };
  try {
    await platformService.setOverride(id, parsed.data.mode, parsed.data.until, admin);
    return { ok: true };
  } catch (e) {
    return fail(e, 'Access could not be changed.');
  }
}

export async function setLockedFeaturesAction(id: string, keys: unknown): Promise<Res> {
  const admin = await requirePlatformAdmin();
  if (!Array.isArray(keys)) return { ok: false, error: 'Invalid features' };
  try {
    await platformService.setLockedFeatures(id, keys.map(String), admin);
    return { ok: true };
  } catch (e) {
    return fail(e, 'The plan features could not be saved.');
  }
}

export async function setLabUserActiveAction(labId: string, userId: string, isActive: boolean): Promise<Res> {
  const admin = await requirePlatformAdmin();
  try {
    await platformService.setUserActive(labId, userId, isActive === true, admin);
    return { ok: true };
  } catch (e) {
    return fail(e, 'The account could not be changed.');
  }
}

export async function resetLabUserPasswordAction(labId: string, userId: string): Promise<{ ok: true; username: string; password: string } | { ok: false; error: string }> {
  const admin = await requirePlatformAdmin();
  try {
    return { ok: true, ...(await platformService.resetUserPassword(labId, userId, admin)) };
  } catch (e) {
    return fail(e, 'The password could not be reset.');
  }
}

export async function removeLabAction(id: string, typedCode: string): Promise<{ ok: true; rows: number } | { ok: false; error: string }> {
  const admin = await requirePlatformAdmin();
  try {
    const report = await platformService.removeLab(id, String(typedCode ?? ''), admin);
    return { ok: true, rows: report.total };
  } catch (e) {
    return fail(e, 'The lab could not be removed.');
  }
}
