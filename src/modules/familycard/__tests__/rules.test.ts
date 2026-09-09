import { describe, it, expect } from 'vitest';
import { canAddMember, cardIsUsable } from '../familycard.rules';

const base = {
  memberCap: 6,
  currentMemberCount: 1,
  alreadyOnThisCard: false,
  onAnotherCard: false,
  cardIsActive: true,
};

describe('family card membership (R1)', () => {
  it('allows a member while there is room', () => {
    expect(canAddMember({ ...base, currentMemberCount: 5 })).toEqual({ ok: true });
  });

  it('counts the card holder within the cap of six', () => {
    // Holder + 5 others = 6. A seventh person must be refused.
    const r = canAddMember({ ...base, currentMemberCount: 6 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain('full');
  });

  it('honours a cap the superadmin has changed', () => {
    expect(canAddMember({ ...base, memberCap: 8, currentMemberCount: 7 })).toEqual({ ok: true });
    expect(canAddMember({ ...base, memberCap: 4, currentMemberCount: 4 }).ok).toBe(false);
  });

  it('refuses a patient already on this card', () => {
    expect(canAddMember({ ...base, alreadyOnThisCard: true }).ok).toBe(false);
  });

  it('refuses a patient who belongs to another card', () => {
    const r = canAddMember({ ...base, onAnotherCard: true });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain('another family card');
  });

  it('refuses an inactive card', () => {
    expect(canAddMember({ ...base, cardIsActive: false }).ok).toBe(false);
  });

  it('refuses an expired card', () => {
    const r = canAddMember({
      ...base,
      expiresAt: new Date('2020-01-01'),
      now: new Date('2026-09-08'),
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain('expired');
  });

  it('a full card stays full — slots are never released', () => {
    // Membership is permanent, so a card at its cap can never be added to
    // again. This is the rule that gives the cap any meaning: if slots could
    // be freed, a holder could rotate people through and everyone benefits.
    const full = { ...base, currentMemberCount: 6 };
    expect(canAddMember(full).ok).toBe(false);
    expect(canAddMember({ ...full, memberCap: 6 }).ok).toBe(false);
  });
});

describe('card usability at booking', () => {
  it('is usable when active and unexpired', () => {
    expect(cardIsUsable({ isActive: true })).toBe(true);
    expect(cardIsUsable({ isActive: true, expiresAt: new Date('2030-01-01') })).toBe(true);
  });

  it('is not usable when deactivated or expired', () => {
    expect(cardIsUsable({ isActive: false })).toBe(false);
    expect(
      cardIsUsable({ isActive: true, expiresAt: new Date('2020-01-01') }, new Date('2026-09-08')),
    ).toBe(false);
  });
});
