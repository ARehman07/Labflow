/**
 * Apply a partner lab's money to its bookings, oldest first.
 *
 * A partner on account pays in lump sums, not per slip. Rather than track which
 * payment settled which slip, everything the partner has paid (less refunds) is
 * poured over its bookings in date order. The result is recomputed whenever a
 * payment or booking changes, so the slips in Billing and the partner's
 * statement can never disagree.
 */
export function allocateCredit(credit: number, invoices: { id: string; net: number }[]): Map<string, number> {
  let left = Math.max(0, credit);
  const paid = new Map<string, number>();
  for (const inv of invoices) {
    const take = Math.max(0, Math.min(inv.net, left));
    paid.set(inv.id, Math.round(take * 100) / 100);
    left -= take;
  }
  return paid;
}

/** Money on a ledger line, as credit to the partner: payments add, refunds take away. */
export function creditOf(type: string, amount: number): number {
  switch (type) {
    case 'PAYMENT':
    case 'TOPUP':
    case 'ADJUSTMENT':
      return amount;
    case 'REFUND':
    case 'CHARGE':
      return -amount;
    default:
      return 0;
  }
}
