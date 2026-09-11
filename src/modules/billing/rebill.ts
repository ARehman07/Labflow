import type { DiscountSource } from './discount';

/**
 * Re-price an invoice after tests are added to or removed from a booking.
 *
 * The discount keeps the basis it was granted on rather than being decided
 * again: a family card or doctor's rate, or a care-of percentage, stays the
 * same RATE on the new total; a legacy fixed amount stays the same amount,
 * shrunk only if the bill falls below it. Re-running the full policy here would
 * need facts nobody has at edit time (the care-of percentage asked for, a card
 * since cancelled) and could quietly change what the patient was promised.
 *
 * The family-card joining fee is untouched: the card was issued either way.
 *
 * Pure and session-free, like discount.ts, so it can be tested directly and
 * run in the browser for the preview.
 */
export interface RebillInput {
  /** The invoice as it stands. */
  gross: number;
  discount: number;
  source: DiscountSource | string;
  cardFee: number;
  /** Test total after the change. */
  newGross: number;
}

export interface RebillResult {
  gross: number;
  discount: number;
  net: number;
}

export function rebill(input: RebillInput): RebillResult {
  const gross = Math.max(0, Math.round(input.newGross));
  const fee = Math.max(0, Math.round(input.cardFee));
  let discount = 0;
  if (gross > 0 && input.discount > 0 && input.gross > 0) {
    discount = input.source === 'MANUAL_FIXED'
      ? input.discount
      : Math.round((gross * input.discount) / input.gross);
  }
  discount = Math.min(Math.max(discount, 0), gross);
  return { gross, discount, net: gross - discount + fee };
}
