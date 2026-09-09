/**
 * Discount resolution.
 *
 * The rules, as set by the lab owner (docs/09-requirements.md, R1):
 *
 *   1. A family-card holder gets the card rate.
 *   2. Where more than one AUTOMATIC discount is eligible (card, doctor),
 *      compute each as an amount and take the LARGEST. They never stack.
 *   3. A card holder gets no manual discount on top. The card rate is final.
 *   4. Manual discount — fixed amount or percentage — is available only when
 *      no automatic discount applies.
 *
 * Policy is configuration, not counter-side discretion: staff apply what this
 * returns, they do not choose it. In xMed any user could discount to zero.
 *
 * Pure and session-free, so every rule above is directly testable.
 */

export type DiscountSource =
  | 'NONE'
  | 'MANUAL_FIXED'
  | 'MANUAL_PERCENT'
  | 'FAMILY_CARD'
  | 'DOCTOR';

export interface DiscountInputs {
  gross: number;
  /** Card rate as a percentage, when the patient holds an active card. */
  familyCardPct?: number | null;
  /** Doctor's patient discount, as a percentage. */
  doctorPct?: number | null;
  /** What reception typed. Ignored when an automatic discount applies. */
  manual?: { type: 'FIXED' | 'PERCENT'; value: number } | null;
}

export interface ResolvedDiscount {
  amount: number;
  source: DiscountSource;
  /** True when a manual entry was discarded because an automatic rule won. */
  manualOverridden: boolean;
  net: number;
}

const pct = (gross: number, p: number) => (gross * Math.min(Math.max(p, 0), 100)) / 100;

export function resolveDiscount(input: DiscountInputs): ResolvedDiscount {
  const gross = Math.max(0, input.gross);

  // Automatic rules compete on amount; the biggest one wins.
  const candidates: { amount: number; source: DiscountSource }[] = [];
  if (input.familyCardPct != null && input.familyCardPct > 0) {
    candidates.push({ amount: pct(gross, input.familyCardPct), source: 'FAMILY_CARD' });
  }
  if (input.doctorPct != null && input.doctorPct > 0) {
    candidates.push({ amount: pct(gross, input.doctorPct), source: 'DOCTOR' });
  }

  if (candidates.length > 0) {
    const winner = candidates.reduce((a, b) => (b.amount > a.amount ? b : a));
    const amount = Math.round(Math.min(winner.amount, gross));
    return {
      amount,
      source: winner.source,
      // A manual entry is discarded, not added — rule 3.
      manualOverridden: Boolean(input.manual && input.manual.value > 0),
      net: gross - amount,
    };
  }

  if (input.manual && input.manual.value > 0) {
    const raw =
      input.manual.type === 'PERCENT' ? pct(gross, input.manual.value) : input.manual.value;
    const amount = Math.round(Math.min(Math.max(raw, 0), gross));
    return {
      amount,
      source: input.manual.type === 'PERCENT' ? 'MANUAL_PERCENT' : 'MANUAL_FIXED',
      manualOverridden: false,
      net: gross - amount,
    };
  }

  return { amount: 0, source: 'NONE', manualOverridden: false, net: gross };
}

/**
 * Invoice arithmetic, with the family-card joining fee.
 *
 * Order matters and is deliberate:
 *
 *     net = (tests − discount) + cardFee
 *
 * The fee is added AFTER the discount, so a 15% card never discounts its own
 * joining fee. Worked example — Rs 1800 of tests, a 15% card, Rs 300 fee:
 *
 *     discount = 270          (15% of 1800)
 *     net      = 1530 + 300   = 1830
 *
 * Charging the fee before the discount would quietly return Rs 45 of it.
 */
export interface InvoiceTotals {
  gross: number;
  discount: number;
  discountSource: DiscountSource;
  cardFee: number;
  net: number;
}

export function computeInvoiceTotals(
  input: DiscountInputs & { cardFee?: number },
): InvoiceTotals {
  const resolved = resolveDiscount(input);
  const cardFee = Math.max(0, Math.round(input.cardFee ?? 0));
  return {
    gross: Math.max(0, input.gross),
    discount: resolved.amount,
    discountSource: resolved.source,
    cardFee,
    net: resolved.net + cardFee,
  };
}
