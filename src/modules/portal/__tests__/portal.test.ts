import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { unscopedPrisma as prisma } from '@/core/db/tenant';
import { deleteTenant } from '@/core/db/tenant-lifecycle';
import { portalService, exposeDevOtp } from '../portal.service';

/**
 * The portal is the only unauthenticated surface in the system, so its two
 * historic defects are pinned here:
 *
 *   1. The OTP was returned to the caller, which is an authentication bypass.
 *   2. Patients were matched by mobile number ALONE. Numbers are not unique
 *      across labs, so one lab's patient could be shown another's reports.
 */
let tenantA: string;
let tenantB: string;
const MOBILE = '03009998877';

async function wipe(code: string) {
  const t = await prisma.tenant.findUnique({ where: { code } });
  if (t) await deleteTenant(t.id);
}

beforeAll(async () => {
  await wipe('portal-a');
  await wipe('portal-b');
  const a = await prisma.tenant.create({ data: { code: 'portal-a', name: 'Lab A' } });
  const b = await prisma.tenant.create({ data: { code: 'portal-b', name: 'Lab B' } });
  tenantA = a.id;
  tenantB = b.id;

  // The SAME mobile number registered at two different labs.
  await prisma.patient.create({
    data: { tenantId: tenantA, mrNo: 'PA-1', fullName: 'Patient A', mobile: MOBILE },
  });
  await prisma.patient.create({
    data: { tenantId: tenantB, mrNo: 'PB-1', fullName: 'Patient B', mobile: MOBILE },
  });
});

afterAll(async () => {
  await wipe('portal-a');
  await wipe('portal-b');
});

describe('the dev-OTP escape hatch', () => {
  const original = { flag: process.env.PORTAL_DEV_OTP, env: process.env.NODE_ENV };
  afterEach(() => {
    process.env.PORTAL_DEV_OTP = original.flag;
    (process.env as Record<string, string | undefined>).NODE_ENV = original.env;
  });

  it('is off unless explicitly enabled', () => {
    process.env.PORTAL_DEV_OTP = 'false';
    expect(exposeDevOtp()).toBe(false);
    delete process.env.PORTAL_DEV_OTP;
    expect(exposeDevOtp()).toBe(false);
  });

  it('is IGNORED in production even when enabled', () => {
    // The bypass must be impossible to turn on by accident on a live server.
    process.env.PORTAL_DEV_OTP = 'true';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    expect(exposeDevOtp()).toBe(false);
  });
});

describe('portal OTP', () => {
  it('does not return the code when the dev flag is off', async () => {
    const original = process.env.PORTAL_DEV_OTP;
    process.env.PORTAL_DEV_OTP = 'false';
    try {
      const res = await portalService.requestOtp('portal-a', MOBILE);
      expect(res.ok).toBe(true);
      expect(res.devCode).toBeUndefined();
    } finally {
      process.env.PORTAL_DEV_OTP = original;
    }
  });

  it('stores the code hashed, never in plain text', async () => {
    const row = await prisma.portalOtp.findUniqueOrThrow({
      where: { tenantId_mobile: { tenantId: tenantA, mobile: MOBILE } },
    });
    expect(row.codeHash).not.toMatch(/^\d{6}$/);
    expect(row.codeHash.startsWith('$2')).toBe(true); // bcrypt
  });

  it('rejects a wrong code and counts the attempt', async () => {
    const before = await prisma.portalOtp.findUniqueOrThrow({
      where: { tenantId_mobile: { tenantId: tenantA, mobile: MOBILE } },
    });
    const res = await portalService.verifyOtp('portal-a', MOBILE, '000000');
    expect(res.ok).toBe(false);
    const after = await prisma.portalOtp.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.attempts).toBe(before.attempts + 1);
  });

  it('enforces a resend cooldown', async () => {
    const res = await portalService.requestOtp('portal-a', MOBILE);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('wait');
  });

  it('gives nothing away about unknown numbers or lab codes', async () => {
    const unknownNumber = await portalService.requestOtp('portal-a', '03001111111');
    const unknownLab = await portalService.requestOtp('no-such-lab', MOBILE);
    expect(unknownNumber).toEqual({ ok: true });
    expect(unknownLab).toEqual({ ok: true });
  });

  it('rejects a malformed mobile', async () => {
    const res = await portalService.requestOtp('portal-a', '123');
    expect(res.ok).toBe(false);
  });
});

describe('portal session isolation', () => {
  it('stores the session token hashed', async () => {
    // Issue a code we control, then verify it.
    const bcrypt = (await import('bcryptjs')).default;
    await prisma.portalOtp.upsert({
      where: { tenantId_mobile: { tenantId: tenantA, mobile: MOBILE } },
      create: {
        tenantId: tenantA,
        mobile: MOBILE,
        codeHash: await bcrypt.hash('123456', 10),
        expiresAt: new Date(Date.now() + 60_000),
      },
      update: {
        codeHash: await bcrypt.hash('123456', 10),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      },
    });

    const res = await portalService.verifyOtp('portal-a', MOBILE, '123456');
    expect(res.ok).toBe(true);
    const token = res.token!;

    const stored = await prisma.portalSession.findFirst({ where: { tenantId: tenantA } });
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.tokenHash).toHaveLength(64); // sha256 hex

    const session = await portalService.resolveSession(token);
    expect(session?.tenantId).toBe(tenantA);
  });

  it('a session for one lab never resolves to the other', async () => {
    const sessions = await prisma.portalSession.findMany({ where: { tenantId: tenantA } });
    expect(sessions.length).toBeGreaterThan(0);
    expect(await prisma.portalSession.count({ where: { tenantId: tenantB } })).toBe(0);
  });

  it('rejects an unknown or empty token', async () => {
    expect(await portalService.resolveSession('')).toBeNull();
    expect(await portalService.resolveSession('deadbeef')).toBeNull();
  });

  it('rejects an expired session', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    await prisma.portalOtp.upsert({
      where: { tenantId_mobile: { tenantId: tenantB, mobile: MOBILE } },
      create: {
        tenantId: tenantB,
        mobile: MOBILE,
        codeHash: await bcrypt.hash('654321', 10),
        expiresAt: new Date(Date.now() + 60_000),
      },
      update: { codeHash: await bcrypt.hash('654321', 10), attempts: 0 },
    });
    const res = await portalService.verifyOtp('portal-b', MOBILE, '654321');
    const token = res.token!;

    await prisma.portalSession.updateMany({
      where: { tenantId: tenantB },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await portalService.resolveSession(token)).toBeNull();
  });
});
