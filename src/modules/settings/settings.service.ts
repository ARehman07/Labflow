import { tenantDb, currentTenantId } from '@/core/db/context';
import type { LabPolicyInput, LetterheadInput } from './settings.schema';

export interface LabPolicy extends LabPolicyInput {
  tenantName: string;
  tenantCode: string;
}

export interface LabLetterhead extends LetterheadInput {
  code: string;
  branchName: string | null;
  branchAddress: string | null;
  branchPhone: string | null;
}

export const settingsService = {
  async getPolicy(): Promise<LabPolicy> {
    const db = await tenantDb();
    const t = await db.tenant.findUniqueOrThrow({
      where: { id: await currentTenantId() },
      select: {
        name: true, code: true,
        familyCardDiscountPct: true, familyCardMemberCap: true, familyCardFee: true,
        familyCardDiscountOnIssue: true, allowSelfVerify: true,
      },
    });
    return {
      tenantName: t.name,
      tenantCode: t.code,
      familyCardDiscountPct: Number(t.familyCardDiscountPct),
      familyCardMemberCap: t.familyCardMemberCap,
      familyCardFee: Number(t.familyCardFee),
      familyCardDiscountOnIssue: t.familyCardDiscountOnIssue,
      allowSelfVerify: t.allowSelfVerify,
    };
  },

  /**
   * Policy changes are not retroactive: existing cards keep the rate recorded
   * on them, and settled invoices are untouched. Only future bookings see the
   * new numbers. The audit row is what makes a later "why did the rate change?"
   * answerable.
   */
  async updatePolicy(input: LabPolicyInput, userId: string) {
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    const before = await this.getPolicy();

    await db.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: input });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          entity: 'Tenant',
          entityId: tenantId,
          action: 'POLICY_UPDATE',
          before: JSON.stringify(before),
          after: JSON.stringify(input),
        },
      });
    });
    return this.getPolicy();
  },
};

export const letterheadService = {
  async get(): Promise<LabLetterhead> {
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    const t = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        name: true, code: true, tagline: true, licenseNo: true, email: true,
        logoDataUrl: true, reportFooterNote: true,
      },
    });
    // The address on a report is the branch's, so show which one it will use.
    const branch = await db.branch.findFirst({
      where: { isActive: true },
      select: { name: true, address: true, phone: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      name: t.name,
      code: t.code,
      tagline: t.tagline ?? undefined,
      licenseNo: t.licenseNo ?? undefined,
      email: t.email ?? undefined,
      logoDataUrl: t.logoDataUrl ?? undefined,
      reportFooterNote: t.reportFooterNote ?? undefined,
      branchName: branch?.name ?? null,
      branchAddress: branch?.address ?? null,
      branchPhone: branch?.phone ?? null,
    };
  },

  async update(input: LetterheadInput, userId: string): Promise<LabLetterhead> {
    const db = await tenantDb();
    const tenantId = await currentTenantId();
    await db.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          name: input.name,
          tagline: input.tagline ?? null,
          licenseNo: input.licenseNo ?? null,
          email: input.email ?? null,
          logoDataUrl: input.logoDataUrl ?? null,
          reportFooterNote: input.reportFooterNote ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId, actorId: userId, entity: 'Tenant', entityId: tenantId,
          action: 'LETTERHEAD_UPDATE',
          // The logo itself is not audited — it would bloat every row.
          after: JSON.stringify({ ...input, logoDataUrl: input.logoDataUrl ? '[image]' : null }),
        },
      });
    });
    return this.get();
  },
};
