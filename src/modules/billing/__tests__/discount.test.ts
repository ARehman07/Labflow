import { describe, it, expect } from 'vitest';
import { resolveDiscount, computeInvoiceTotals } from '../discount';

describe('discount resolution (R1)', () => {
  it('applies the card rate to a card holder', () => {
    const r = resolveDiscount({ gross: 1800, familyCardPct: 15 });
    expect(r.amount).toBe(270);
    expect(r.source).toBe('FAMILY_CARD');
    expect(r.net).toBe(1530);
  });

  it('takes the larger of card and doctor — they never stack', () => {
    // 1800: card 15% = 270, doctor 10% = 180. Stacked would be 450.
    const r = resolveDiscount({ gross: 1800, familyCardPct: 15, doctorPct: 10 });
    expect(r.amount).toBe(270);
    expect(r.source).toBe('FAMILY_CARD');
    expect(r.net).toBe(1530);
  });

  it('lets the doctor rate win when it is the larger', () => {
    const r = resolveDiscount({ gross: 1800, familyCardPct: 5, doctorPct: 20 });
    expect(r.amount).toBe(360);
    expect(r.source).toBe('DOCTOR');
  });

  it('discards a manual discount for a card holder', () => {
    const r = resolveDiscount({
      gross: 1800,
      familyCardPct: 15,
      manual: { type: 'FIXED', value: 500 },
    });
    expect(r.amount).toBe(270); // not 770, and not 500
    expect(r.source).toBe('FAMILY_CARD');
    expect(r.manualOverridden).toBe(true);
  });

  it('allows a fixed manual discount when no card applies', () => {
    const r = resolveDiscount({ gross: 1800, manual: { type: 'FIXED', value: 500 } });
    expect(r.amount).toBe(500);
    expect(r.source).toBe('MANUAL_FIXED');
    expect(r.net).toBe(1300);
  });

  it('allows a percentage manual discount when no card applies', () => {
    const r = resolveDiscount({ gross: 1800, manual: { type: 'PERCENT', value: 5 } });
    expect(r.amount).toBe(90);
    expect(r.source).toBe('MANUAL_PERCENT');
    expect(r.net).toBe(1710);
  });

  it('never discounts below zero', () => {
    const r = resolveDiscount({ gross: 500, manual: { type: 'FIXED', value: 9999 } });
    expect(r.amount).toBe(500);
    expect(r.net).toBe(0);
  });

  it('clamps a percentage above 100', () => {
    const r = resolveDiscount({ gross: 1000, manual: { type: 'PERCENT', value: 250 } });
    expect(r.amount).toBe(1000);
    expect(r.net).toBe(0);
  });

  it('returns NONE when nothing applies', () => {
    const r = resolveDiscount({ gross: 1800 });
    expect(r.amount).toBe(0);
    expect(r.source).toBe('NONE');
    expect(r.net).toBe(1800);
  });

  it('ignores a zero or negative rate', () => {
    const r = resolveDiscount({ gross: 1000, familyCardPct: 0, doctorPct: -5 });
    expect(r.source).toBe('NONE');
  });
});

describe('invoice totals with the family-card fee (R1)', () => {
  it("adds the fee after the discount so the fee is not discounted", () => {
    // Tests 1800, card 15%, joining fee 300.
    const t = computeInvoiceTotals({ gross: 1800, familyCardPct: 15, cardFee: 300 });
    expect(t.discount).toBe(270);
    expect(t.cardFee).toBe(300);
    expect(t.net).toBe(1830); // 1530 + 300, not 1785
  });

  it('charges the fee even when no discount applies', () => {
    const t = computeInvoiceTotals({ gross: 1800, cardFee: 300 });
    expect(t.discount).toBe(0);
    expect(t.net).toBe(2100);
  });

  it('charges nothing extra when no card is being issued', () => {
    const t = computeInvoiceTotals({ gross: 1800, familyCardPct: 15 });
    expect(t.cardFee).toBe(0);
    expect(t.net).toBe(1530);
  });

  it('still refuses a manual discount for a card holder paying a fee', () => {
    const t = computeInvoiceTotals({
      gross: 1800,
      familyCardPct: 15,
      cardFee: 300,
      manual: { type: 'FIXED', value: 500 },
    });
    expect(t.discountSource).toBe('FAMILY_CARD');
    expect(t.net).toBe(1830);
  });

  it('never lets a fee go negative', () => {
    const t = computeInvoiceTotals({ gross: 1000, cardFee: -50 });
    expect(t.cardFee).toBe(0);
    expect(t.net).toBe(1000);
  });
});

describe("the owner's worked example", () => {
  it('Rs 1000 of tests + a new 15% card at Rs 300 = 1150', () => {
    const t = computeInvoiceTotals({ gross: 1000, familyCardPct: 15, cardFee: 300 });
    expect(t.discount).toBe(150);   // 15% of 1000
    expect(t.net - t.cardFee).toBe(850); // discounted tests
    expect(t.cardFee).toBe(300);
    expect(t.net).toBe(1150);       // 850 + 300
  });

  it('the same patient on their next visit pays 850, with no fee', () => {
    const t = computeInvoiceTotals({ gross: 1000, familyCardPct: 15 });
    expect(t.cardFee).toBe(0);
    expect(t.net).toBe(850);
  });
});

describe('joining a relative’s card (R1)', () => {
  it('a joined card discounts the tests but charges no fee', () => {
    // "My son has the card, put me on his" — the card is already paid for.
    const t = computeInvoiceTotals({ gross: 1000, familyCardPct: 15, cardFee: 0 });
    expect(t.discount).toBe(150);
    expect(t.cardFee).toBe(0);
    expect(t.net).toBe(850);
  });

  it('creating a card on the same bill still charges the fee', () => {
    const t = computeInvoiceTotals({ gross: 1000, familyCardPct: 15, cardFee: 300 });
    expect(t.net).toBe(1150);
  });
});
