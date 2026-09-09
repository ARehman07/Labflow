/**
 * Pure invoice-status rules, kept out of the service so they can be tested
 * without a database — the same shape as discount.ts.
 */

export type InvoiceStatus = 'DUE' | 'PARTIAL' | 'PAID' | 'REFUNDED';

/** Status implied by how much of `net` has been paid. */
export function statusFor(net: number, paid: number): 'DUE' | 'PARTIAL' | 'PAID' {
  if (paid <= 0) return 'DUE';
  if (paid >= net) return 'PAID';
  return 'PARTIAL';
}

/**
 * Status after refunding `amount` from `paid`.
 *
 * REFUNDED means "the lab holds none of this patient's money any more". A
 * partial refund leaves a balance still owed, and calling that REFUNDED hides
 * it from the Due filter while the summary keeps counting it — the balance
 * becomes money you are owed but can never find.
 */
export function statusAfterRefund(net: number, paid: number, amount: number): InvoiceStatus {
  const newPaid = paid - amount;
  return newPaid <= 0 ? 'REFUNDED' : statusFor(net, newPaid);
}
