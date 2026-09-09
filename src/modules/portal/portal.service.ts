import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
// The patient portal is unauthenticated: there is no session to read a tenant
// from. The lab is identified explicitly by its code, because a mobile number
// is NOT unique across labs — two tenants can hold the same number, and
// resolving without a tenant would show one lab's reports to another's patient.
import { unscopedPrisma as prisma } from '@/core/db/tenant';
import type { ReportData } from '@/modules/reporting/report.types';

const RELEASED = ['APPROVED', 'PRINTED', 'DELIVERED'];

const OTP_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_SENDS_PER_HOUR = 5;
const MOBILE_RE = /^0\d{10}$/;

/**
 * Returning the code to the caller is an authentication bypass: anyone who
 * knows a patient's mobile number can read it straight out of the response.
 * It is allowed ONLY when explicitly switched on for local development, and
 * never when NODE_ENV is production.
 *
 * Read at call time, not at import: a module-level constant cannot be tested,
 * and cannot be turned off without a restart.
 */
export function exposeDevOtp(): boolean {
  return process.env.PORTAL_DEV_OTP === 'true' && process.env.NODE_ENV !== 'production';
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export interface PortalReportSummary {
  visitId: string;
  slipNo: string;
  date: string;
  tests: string[];
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

async function resolveTenant(labCode: string) {
  return prisma.tenant.findUnique({
    where: { code: labCode.trim().toLowerCase() },
    select: { id: true, isActive: true },
  });
}

export const portalService = {
  /**
   * Issue a one-time code for a patient of this lab.
   *
   * Responds identically whether or not the number is known, so the portal
   * cannot be used to discover which numbers are registered.
   */
  async requestOtp(
    labCode: string,
    mobile: string,
  ): Promise<{ ok: boolean; devCode?: string; error?: string }> {
    if (!MOBILE_RE.test(mobile)) {
      return { ok: false, error: 'Enter a valid 11-digit mobile (e.g. 03001234567)' };
    }

    const tenant = await resolveTenant(labCode);
    if (!tenant || !tenant.isActive) return { ok: true }; // do not confirm lab codes either

    const patient = await prisma.patient.findFirst({
      where: { tenantId: tenant.id, mobile },
      select: { id: true },
    });
    if (!patient) return { ok: true };

    const now = new Date();
    const existing = await prisma.portalOtp.findUnique({
      where: { tenantId_mobile: { tenantId: tenant.id, mobile } },
    });

    if (existing) {
      if (now.getTime() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
        return { ok: false, error: 'Please wait a minute before requesting another code.' };
      }
      const windowAge = now.getTime() - existing.windowStartedAt.getTime();
      if (windowAge < 3_600_000 && existing.sendCount >= MAX_SENDS_PER_HOUR) {
        return { ok: false, error: 'Too many codes requested. Try again later.' };
      }
    }

    const code = String(randomInt(100000, 1000000)); // 6 digits
    const codeHash = await bcrypt.hash(code, 10);
    const windowExpired =
      !existing || now.getTime() - existing.windowStartedAt.getTime() >= 3_600_000;

    await prisma.portalOtp.upsert({
      where: { tenantId_mobile: { tenantId: tenant.id, mobile } },
      create: {
        tenantId: tenant.id,
        mobile,
        codeHash,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      },
      update: {
        codeHash,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        attempts: 0,
        lastSentAt: now,
        sendCount: windowExpired ? 1 : { increment: 1 },
        ...(windowExpired ? { windowStartedAt: now } : {}),
      },
    });

    // TODO: hand `code` to an SMS provider here.
    return exposeDevOtp() ? { ok: true, devCode: code } : { ok: true };
  },

  async verifyOtp(
    labCode: string,
    mobile: string,
    code: string,
  ): Promise<{ ok: boolean; token?: string; error?: string }> {
    const tenant = await resolveTenant(labCode);
    if (!tenant) return { ok: false, error: 'Code expired. Request a new one.' };

    const otp = await prisma.portalOtp.findUnique({
      where: { tenantId_mobile: { tenantId: tenant.id, mobile } },
    });
    if (!otp || otp.expiresAt < new Date()) {
      return { ok: false, error: 'Code expired. Request a new one.' };
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      await prisma.portalOtp.delete({ where: { id: otp.id } });
      return { ok: false, error: 'Too many attempts. Request a new code.' };
    }

    const matches = await bcrypt.compare(code, otp.codeHash);
    if (!matches) {
      await prisma.portalOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      return { ok: false, error: 'Incorrect code.' };
    }

    await prisma.portalOtp.delete({ where: { id: otp.id } });

    const token = randomBytes(32).toString('hex');
    await prisma.portalSession.create({
      data: {
        tenantId: tenant.id,
        tokenHash: sha256(token),
        mobile,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    // Opportunistic cleanup of anything already expired.
    await prisma.portalSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    return { ok: true, token };
  },

  /** The session behind a token, or null. Carries the tenant with it. */
  async resolveSession(token: string): Promise<{ tenantId: string; mobile: string } | null> {
    if (!token) return null;
    const session = await prisma.portalSession.findUnique({
      where: { tokenHash: sha256(token) },
      select: { id: true, tenantId: true, mobile: true, expiresAt: true },
    });
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      await prisma.portalSession.delete({ where: { id: session.id } });
      return null;
    }
    return { tenantId: session.tenantId, mobile: session.mobile };
  },

  async listReports(token: string): Promise<PortalReportSummary[] | null> {
    const session = await this.resolveSession(token);
    if (!session) return null;

    const visits = await prisma.visit.findMany({
      where: {
        tenantId: session.tenantId,
        patient: { mobile: session.mobile },
        orderLines: { some: { status: { in: RELEASED } } },
      },
      include: {
        orderLines: { where: { status: { in: RELEASED } }, include: { test: true } },
      },
      orderBy: { bookedAt: 'desc' },
      take: 30,
    });

    return visits.map((v) => ({
      visitId: v.id,
      slipNo: v.slipNo,
      date: fmtDate(v.bookedAt),
      tests: v.orderLines.map((l) => l.test.name),
    }));
  },

  async getReport(token: string, visitId: string): Promise<ReportData | null> {
    const session = await this.resolveSession(token);
    if (!session) return null;

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      include: { patient: { select: { mobile: true } } },
    });
    // Ownership AND tenancy: the same mobile can exist in another lab.
    if (!visit || visit.tenantId !== session.tenantId) return null;
    if (visit.patient.mobile !== session.mobile) return null;

    // Imported lazily: the reporting module reaches auth, and the portal must
    // stay loadable without a session.
    const { getReportData } = await import('@/modules/reporting/reporting.service');
    return getReportData(visitId, session.tenantId);
  },
};

export const __testing = { sha256, timingSafeEqual };
