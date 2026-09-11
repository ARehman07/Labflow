'use server';

import { z } from 'zod';
import { can, currentUser, requirePermission } from '@/core/rbac/guard';
import { pricingService, PricingError } from './pricing.service';

type Res = { ok: true; id?: string } | { ok: false; error: string };

const fail = (e: unknown, fallback: string): Res => ({ ok: false, error: e instanceof PricingError ? e.message : fallback });

export interface PackageDTO {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  listTotal: number;
  tests: { id: string; name: string; price: number }[];
}
export interface RateGroupDTO {
  id: string;
  name: string;
  defaultDiscountPct: number;
  isActive: boolean;
  priceCount: number;
  usedBy: number;
}
export interface CollectionPointDTO {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  branchId: string;
  branchName: string;
  rateGroupId: string | null;
  rateGroupName: string | null;
  isActive: boolean;
}

async function mayRead() {
  return (await can('visit.create')) || (await can('admin.manage'));
}

export async function listPackagesAction(includeInactive = false): Promise<PackageDTO[]> {
  if (!(await mayRead())) return [];
  const user = await currentUser();
  return pricingService.listPackages(user.branchId, includeInactive);
}

const packageSchema = z.object({
  name: z.string().trim().min(2, 'Enter the package name').max(80),
  price: z.coerce.number().min(0, 'Enter the package price'),
  testIds: z.array(z.string().min(1)).max(60),
});

export async function savePackageAction(id: string | null, input: unknown): Promise<Res> {
  await requirePermission('admin.manage');
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid package' };
  try {
    return { ok: true, id: await pricingService.savePackage(id, parsed.data) };
  } catch (e) {
    return fail(e, 'The package could not be saved.');
  }
}

export async function setPackageActiveAction(id: string, isActive: boolean): Promise<Res> {
  await requirePermission('admin.manage');
  await pricingService.setPackageActive(id, isActive);
  return { ok: true };
}

export async function listRateGroupsAction(includeInactive = false): Promise<RateGroupDTO[]> {
  if (!(await mayRead())) return [];
  return pricingService.listRateGroups(includeInactive);
}

const rateGroupSchema = z.object({
  name: z.string().trim().min(2, 'Enter the rate group name').max(60),
  defaultDiscountPct: z.coerce.number().min(0).max(100, 'A discount cannot be more than 100%').default(0),
});

export async function saveRateGroupAction(id: string | null, input: unknown): Promise<Res> {
  await requirePermission('admin.manage');
  const parsed = rateGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid rate group' };
  try {
    return { ok: true, id: await pricingService.saveRateGroup(id, parsed.data) };
  } catch (e) {
    return fail(e, 'The rate group could not be saved.');
  }
}

export async function setRateGroupActiveAction(id: string, isActive: boolean): Promise<Res> {
  await requirePermission('admin.manage');
  await pricingService.setRateGroupActive(id, isActive);
  return { ok: true };
}

export interface RateGroupPricesDTO {
  id: string;
  name: string;
  defaultDiscountPct: number;
  tests: { testId: string; name: string; code: string; department: string; standard: number; price: number | null }[];
}

export async function getRateGroupPricesAction(rateGroupId: string): Promise<RateGroupPricesDTO | null> {
  const user = await requirePermission('admin.manage');
  return pricingService.rateGroupPrices(rateGroupId, user.branchId);
}

const pricesSchema = z.array(z.object({ testId: z.string().min(1), price: z.number().min(0).nullable() })).max(2000);

export async function setRateGroupPricesAction(rateGroupId: string, entries: unknown): Promise<Res> {
  await requirePermission('admin.manage');
  const parsed = pricesSchema.safeParse(entries);
  if (!parsed.success) return { ok: false, error: 'Prices must be numbers of zero or more.' };
  await pricingService.setRateGroupPrices(rateGroupId, parsed.data);
  return { ok: true };
}

export async function listCollectionPointsAction(includeInactive = false): Promise<CollectionPointDTO[]> {
  if (!(await mayRead())) return [];
  return pricingService.listCollectionPoints(includeInactive);
}

const blank = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);
const collectionPointSchema = z.object({
  name: z.string().trim().min(2, 'Enter the collection point name').max(80),
  branchId: z.string().min(1, 'Choose a branch'),
  phone: z.string().max(40).optional().transform(blank),
  address: z.string().max(200).optional().transform(blank),
  rateGroupId: z.string().optional().transform(blank),
});

export async function saveCollectionPointAction(id: string | null, input: unknown): Promise<Res> {
  await requirePermission('admin.manage');
  const parsed = collectionPointSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid collection point' };
  try {
    return { ok: true, id: await pricingService.saveCollectionPoint(id, parsed.data) };
  } catch (e) {
    return fail(e, 'The collection point could not be saved.');
  }
}

export async function setCollectionPointActiveAction(id: string, isActive: boolean): Promise<Res> {
  await requirePermission('admin.manage');
  await pricingService.setCollectionPointActive(id, isActive);
  return { ok: true };
}
