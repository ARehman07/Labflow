import { unscopedPrisma as prisma } from '@/core/db/tenant';
import { applyLocks, parseFeatures, parseLocked } from '@/core/features/catalog';

/**
 * Hold a report while its slip has money due.
 *
 * A report is the lab's product; handing it over before it is paid for is how
 * a lab ends up chasing patients for money it will never see. So, when the lab
 * has "hold reports until paid" on, nothing lets a report out while there is a
 * balance: not printing or saving it at the counter, not WhatsApp, SMS or
 * email, not the patient's own portal, not the referring doctor's portal, and
 * not the automatic "your report is ready" message (that one waits and goes
 * out when the bill is settled).
 *
 * Three things end a hold: the bill is paid (a discount or write-off in
 * Billing counts), the slip is billed to a partner lab on account (the
 * partner pays, not the patient), or someone allowed to — the Owner or an
 * Admin by default — releases it anyway with a reason, which is kept.
 *
 * Lab work is never held: results are entered, verified and approved as usual,
 * and a critical value still reaches the doctor. Only the report's leaving is.
 */

export interface ReportHold {
  /** True while the report must not leave the lab. */
  held: boolean;
  /** What is still owed on the slip, in rupees (0 when paid). */
  due: number;
  invoiceId: string | null;
  /** Set when the report was let out with money due. */
  releasedUnpaid: { at: Date; reason: string | null } | null;
}

export interface HoldFacts {
  net: number;
  paid: number;
  /** The slip is billed to a partner lab's account rather than the patient. */
  onAccount: boolean;
  releasedUnpaid: boolean;
  /** The lab's "hold reports until paid" switch. */
  holdOn: boolean;
}

/** The rule itself, apart from the database, so every case can be tested. */
export function holdFrom(f: HoldFacts): { held: boolean; due: number } {
  const due = Math.max(0, Math.round(f.net - f.paid));
  // Under a rupee is rounding, not a debt.
  const held = f.holdOn && due >= 1 && !f.onAccount && !f.releasedUnpaid;
  return { held, due };
}

const SELECT = {
  id: true,
  releasedUnpaidAt: true,
  releasedUnpaidReason: true,
  invoice: { select: { id: true, netAmount: true, paidAmount: true } },
  partnerLab: { select: { accountType: true } },
} as const;

async function holdOnFor(tenantId: string): Promise<boolean> {
  const row = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { features: true, lockedFeatures: true } });
  return applyLocks(parseFeatures(row?.features), parseLocked(row?.lockedFeatures))['money.holdUnpaidReports'];
}

/**
 * The hold on several slips of one lab, by visit id. Reads with the tenant
 * given, not the session's, so the patient and doctor portals can use it too.
 */
export async function reportHolds(visitIds: string[], tenantId: string): Promise<Map<string, ReportHold>> {
  const out = new Map<string, ReportHold>();
  if (visitIds.length === 0) return out;
  const [holdOn, visits] = await Promise.all([
    holdOnFor(tenantId),
    prisma.visit.findMany({ where: { id: { in: visitIds }, tenantId }, select: SELECT }),
  ]);
  for (const v of visits) {
    const { held, due } = holdFrom({
      net: Number(v.invoice?.netAmount ?? 0),
      paid: Number(v.invoice?.paidAmount ?? 0),
      onAccount: v.partnerLab != null && v.partnerLab.accountType !== 'CASH',
      releasedUnpaid: v.releasedUnpaidAt != null,
      holdOn,
    });
    out.set(v.id, {
      held,
      due,
      invoiceId: v.invoice?.id ?? null,
      releasedUnpaid: v.releasedUnpaidAt ? { at: v.releasedUnpaidAt, reason: v.releasedUnpaidReason } : null,
    });
  }
  return out;
}

export async function reportHold(visitId: string, tenantId: string): Promise<ReportHold> {
  return (await reportHolds([visitId], tenantId)).get(visitId)
    ?? { held: false, due: 0, invoiceId: null, releasedUnpaid: null };
}

/** The sentence staff see when a held report is asked for. */
export function heldMessage(due: number): string {
  return `Rs ${due.toLocaleString('en-PK')} is still due on this slip. Collect it in Billing before the report goes out.`;
}
