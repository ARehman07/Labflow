/**
 * What a lab may do, from its subscription.
 *
 *   ACTIVE     paid up (or billing not set up, or kept open by hand) — everything
 *   GRACE      overdue but within the grace days — everything, with a warning
 *   READ_ONLY  overdue past the grace days, or restricted by hand — look, never change
 *   SUSPENDED  switched off from the platform console — nothing
 *
 * Read-only keeps what a lab still owes its patients: finding a released report
 * and printing or delivering it. Everything that creates or changes a record —
 * a booking, a result, a payment, a setting — waits until the lab renews.
 */

export type AccessLevel = 'ACTIVE' | 'GRACE' | 'READ_ONLY' | 'SUSPENDED';
export type AccessReason = 'SUSPENDED' | 'RESTRICTED' | 'KEPT_OPEN' | 'PAID' | 'NO_BILLING' | 'GRACE' | 'OVERDUE';

export interface LabBilling {
  isActive: boolean;
  paidUntil: Date | null;
  graceDays: number;
  accessOverride: string;
  overrideUntil: Date | null;
}

export interface LabAccess {
  level: AccessLevel;
  reason: AccessReason;
  /** When a lab in grace, or kept open by hand, turns read-only. */
  restrictsOn: Date | null;
}

/** The permissions a read-only lab keeps. */
export const READ_ONLY_PERMISSIONS: ReadonlySet<string> = new Set([
  'billing.view', 'finance.view', 'insights.view', 'report.print', 'report.deliver', 'b2b.portal', 'doctor.portal',
]);

const DAY = 86_400_000;
const endOfDay = (d: Date) => { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; };

export function labAccess(b: LabBilling, now = new Date()): LabAccess {
  if (!b.isActive) return { level: 'SUSPENDED', reason: 'SUSPENDED', restrictsOn: null };
  if (b.accessOverride === 'READ_ONLY') return { level: 'READ_ONLY', reason: 'RESTRICTED', restrictsOn: null };
  if (b.accessOverride === 'ACTIVE' && (!b.overrideUntil || endOfDay(b.overrideUntil) >= now)) {
    return { level: 'ACTIVE', reason: 'KEPT_OPEN', restrictsOn: b.overrideUntil ? endOfDay(b.overrideUntil) : null };
  }
  if (!b.paidUntil) return { level: 'ACTIVE', reason: 'NO_BILLING', restrictsOn: null };
  const paidEnd = endOfDay(b.paidUntil);
  if (now <= paidEnd) return { level: 'ACTIVE', reason: 'PAID', restrictsOn: null };
  const graceEnd = new Date(paidEnd.getTime() + Math.max(0, b.graceDays) * DAY);
  if (now <= graceEnd) return { level: 'GRACE', reason: 'GRACE', restrictsOn: graceEnd };
  return { level: 'READ_ONLY', reason: 'OVERDUE', restrictsOn: null };
}

export function permissionAllowed(level: AccessLevel, permission: string): boolean {
  if (level === 'ACTIVE' || level === 'GRACE') return true;
  return level === 'READ_ONLY' && READ_ONLY_PERMISSIONS.has(permission);
}

export function effectivePermissions(level: AccessLevel, permissions: string[]): string[] {
  return permissions.filter((p) => permissionAllowed(level, p));
}

/**
 * The period a payment for `months` covers: straight on from the current
 * paid-until when the lab is still paid up, otherwise from today — a lab that
 * paid late does not pay for the days it was already restricted.
 */
export function paymentPeriod(paidUntil: Date | null, months: number, now = new Date()): { from: Date; to: Date } {
  const from = paidUntil && endOfDay(paidUntil) >= now ? new Date(paidUntil.getTime() + DAY) : new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setMonth(to.getMonth() + months);
  to.setDate(to.getDate() - 1);
  return { from, to };
}

/**
 * Whole months a period covers, counting a part month as one: 1 Sept – 30 Sept
 * is 1, 15 Sept – 14 Oct is 1, 1 Sept – 31 Oct is 2. Recorded with a payment
 * the platform admin dated by hand, for the lab's payment history.
 */
export function monthsCovered(from: Date, to: Date): number {
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  let months = (end.getFullYear() - from.getFullYear()) * 12 + (end.getMonth() - from.getMonth());
  if (end.getDate() > from.getDate()) months += 1;
  return Math.max(1, months);
}
