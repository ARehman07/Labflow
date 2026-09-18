import { describe, it, expect } from 'vitest';
import { effectivePermissions, labAccess, monthsCovered, paymentPeriod, permissionAllowed } from '../access';

const now = new Date('2026-09-15T10:00:00');
const day = (s: string) => new Date(`${s}T00:00:00`);
const base = { isActive: true, paidUntil: null as Date | null, graceDays: 7, accessOverride: 'NONE', overrideUntil: null as Date | null };

describe('labAccess', () => {
  it('is open when billing is not set up', () => {
    expect(labAccess(base, now)).toMatchObject({ level: 'ACTIVE', reason: 'NO_BILLING' });
  });

  it('is open through the last paid day', () => {
    expect(labAccess({ ...base, paidUntil: day('2026-09-15') }, now).level).toBe('ACTIVE');
  });

  it('warns during the grace days, then turns read-only', () => {
    const grace = labAccess({ ...base, paidUntil: day('2026-09-10') }, now);
    expect(grace.level).toBe('GRACE');
    expect(grace.restrictsOn?.getDate()).toBe(17);
    expect(labAccess({ ...base, paidUntil: day('2026-09-01') }, now)).toMatchObject({ level: 'READ_ONLY', reason: 'OVERDUE' });
  });

  it('follows a hand override either way', () => {
    expect(labAccess({ ...base, paidUntil: day('2027-01-01'), accessOverride: 'READ_ONLY' }, now).level).toBe('READ_ONLY');
    expect(labAccess({ ...base, paidUntil: day('2026-01-01'), accessOverride: 'ACTIVE', overrideUntil: day('2026-09-20') }, now).level).toBe('ACTIVE');
    expect(labAccess({ ...base, paidUntil: day('2026-01-01'), accessOverride: 'ACTIVE', overrideUntil: day('2026-09-01') }, now).level).toBe('READ_ONLY');
  });

  it('is suspended whatever else is set', () => {
    expect(labAccess({ ...base, isActive: false, accessOverride: 'ACTIVE' }, now).level).toBe('SUSPENDED');
  });
});

describe('read-only permissions', () => {
  it('keeps reports and views, drops everything that changes records', () => {
    expect(permissionAllowed('READ_ONLY', 'report.print')).toBe(true);
    expect(permissionAllowed('READ_ONLY', 'visit.create')).toBe(false);
    expect(permissionAllowed('GRACE', 'visit.create')).toBe(true);
    expect(effectivePermissions('READ_ONLY', ['visit.create', 'billing.view', 'result.enter', 'report.deliver'])).toEqual(['billing.view', 'report.deliver']);
    expect(permissionAllowed('SUSPENDED', 'report.print')).toBe(false);
  });
});

describe('paymentPeriod', () => {
  it('carries straight on from a paid-up date', () => {
    const p = paymentPeriod(day('2026-09-30'), 1, now);
    expect([p.from.getMonth(), p.from.getDate(), p.to.getMonth(), p.to.getDate()]).toEqual([9, 1, 9, 31]);
  });

  it('starts from today for a lab already overdue', () => {
    const p = paymentPeriod(day('2026-08-01'), 3, now);
    expect([p.from.getMonth(), p.from.getDate(), p.to.getMonth(), p.to.getDate()]).toEqual([8, 15, 11, 14]);
  });
});

describe('monthsCovered', () => {
  const d = (s: string) => new Date(`${s}T00:00:00`);
  it('counts a calendar month as one', () => {
    expect(monthsCovered(d('2026-09-01'), d('2026-09-30'))).toBe(1);
    expect(monthsCovered(d('2026-10-01'), d('2026-10-31'))).toBe(1);
  });
  it('counts a month that runs across two', () => {
    expect(monthsCovered(d('2026-09-15'), d('2026-10-14'))).toBe(1);
  });
  it('counts several, and a part month as a whole one', () => {
    expect(monthsCovered(d('2026-09-01'), d('2026-11-30'))).toBe(3);
    expect(monthsCovered(d('2026-09-01'), d('2026-10-10'))).toBe(2);
    expect(monthsCovered(d('2026-09-01'), d('2026-09-10'))).toBe(1);
  });
});
