'use server';

import { z } from 'zod';
import { requirePermission } from '@/core/rbac/guard';
import { tenantDb } from '@/core/db/context';
import { stockService, StockError } from './stock.service';

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown, fallback: string) => ({ ok: false as const, error: e instanceof StockError ? e.message : fallback });
const blank = (s?: string) => (s && s.trim() ? s.trim() : undefined);

export type StockItemDTO = Awaited<ReturnType<typeof stockService.listItems>>[number];
export type StockMovementDTO = Awaited<ReturnType<typeof stockService.register>>[number];
export type ConsumableDTO = Awaited<ReturnType<typeof stockService.consumables>>[number];

export async function listStockItemsAction(includeInactive = true): Promise<StockItemDTO[]> {
  await requirePermission('stock.manage');
  return stockService.listItems(includeInactive);
}

const itemSchema = z.object({
  name: z.string().trim().min(2, 'Enter the item name').max(80),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  reorderLevel: z.coerce.number().min(0).default(0),
  openingQty: z.coerce.number().min(0).default(0),
  expiresAt: z.string().optional().transform((s) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : undefined)),
});

export async function createStockItemAction(input: unknown): Promise<Res<{ id: string }>> {
  const user = await requirePermission('stock.manage');
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid item' };
  try {
    return { ok: true, id: await stockService.createItem(parsed.data, user.id) };
  } catch (e) {
    return fail(e, 'The item could not be added.');
  }
}

export async function setStockItemActiveAction(id: string, isActive: boolean): Promise<Res> {
  await requirePermission('stock.manage');
  await stockService.setActive(id, isActive);
  return { ok: true };
}

const moveSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(['RECEIVE', 'ISSUE', 'ADJUST', 'RETURN']),
  quantity: z.coerce.number().refine((n) => Number.isFinite(n) && n !== 0, 'Enter a quantity.'),
  department: z.string().max(60).optional().transform(blank),
  issuedBy: z.string().max(60).optional().transform(blank),
  receivedBy: z.string().max(60).optional().transform(blank),
  note: z.string().max(200).optional().transform(blank),
});

export async function moveStockAction(input: unknown): Promise<Res<{ serialNo: number; balanceAfter: number }>> {
  const user = await requirePermission('stock.manage');
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid entry' };
  try {
    const { itemId, ...rest } = parsed.data;
    const m = await stockService.move(itemId, rest, user.id);
    return { ok: true, serialNo: m.serialNo, balanceAfter: Number(m.balanceAfter) };
  } catch (e) {
    return fail(e, 'The entry could not be saved.');
  }
}

export async function stockRegisterAction(from: string, to: string, itemId?: string): Promise<StockMovementDTO[]> {
  await requirePermission('stock.manage');
  const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/u.test(s) ? new Date(`${s}T00:00:00`) : null);
  const start = day(from) ?? new Date(Date.now() - 30 * 86_400_000);
  const end = day(to) ?? new Date();
  end.setDate(end.getDate() + 1);
  return stockService.register({ start, end, itemId: itemId || undefined });
}

export async function stockConsumablesAction(): Promise<{ rows: ConsumableDTO[]; tests: { id: string; name: string }[] }> {
  await requirePermission('stock.manage');
  const [rows, tests] = await Promise.all([
    stockService.consumables(),
    (await tenantDb()).test.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  return { rows, tests };
}

export async function setConsumableAction(testId: string, itemId: string, quantity: number): Promise<Res> {
  await requirePermission('stock.manage');
  if (!testId || !itemId || !Number.isFinite(quantity) || quantity < 0) return { ok: false, error: 'Choose a test, an item and a quantity.' };
  await stockService.setConsumable(testId, itemId, quantity);
  return { ok: true };
}
