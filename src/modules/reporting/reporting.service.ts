import { tenantDb } from '@/core/db/context';
import { forTenant } from '@/core/db/tenant';
import { pickRange, ageInDays, type ReferenceRangeDef, type AgeUnit } from '@/modules/lab/calc-engine';
import type { ReportData, ReportTest } from './report.types';

const RELEASED = ['APPROVED', 'PRINTED', 'DELIVERED'] as const;

function referenceText(
  ranges: ReferenceRangeDef[],
  ageDays: number | null,
  sex: string | null,
): string {
  const picked = pickRange(ranges, {
    ageDays,
    sex: (sex as 'MALE' | 'FEMALE' | 'OTHER' | null) ?? null,
  });
  if (!picked) return '';
  if (picked.displayText) return picked.displayText;
  if (picked.low !== null && picked.high !== null) return `${picked.low} – ${picked.high}`;
  if (picked.high !== null) return `< ${picked.high}`;
  if (picked.low !== null) return `> ${picked.low}`;
  return '';
}

/**
 * Build the released report for a visit — only tests that have been approved
 * (or later) are included. Returns null if the visit has no released results.
 */
/**
 * Build a report.
 *
 * `tenantId` may be supplied by callers that have no session — the patient
 * portal is unauthenticated, and resolves its tenant from the portal session
 * instead. Without it, the signed-in user's tenant is used.
 */
export async function getReportData(
  visitId: string,
  tenantId?: string,
): Promise<ReportData | null> {
  const db = tenantId ? forTenant(tenantId) : await tenantDb();
  const visit = await db.visit.findUnique({
    where: { id: visitId },
    include: {
      patient: true,
      branch: true,
      doctor: true,
      // The letterhead belongs to the lab, not the branch — a report headed
      // "Main Branch" tells a patient nothing about who tested their blood.
      tenant: {
        select: {
          name: true, tagline: true, logoDataUrl: true,
          licenseNo: true, email: true, reportFooterNote: true,
        },
      },
      orderLines: {
        where: { status: { in: RELEASED as unknown as string[] } },
        include: {
          test: { include: { parameters: { orderBy: { sortOrder: 'asc' }, include: { referenceRanges: true } } } },
          results: { include: { approvedBy: true } },
        },
      },
    },
  });
  if (!visit || visit.orderLines.length === 0) return null;

  const { age, sex } = visit.patient;
  const ageDays = ageInDays(visit.patient as {
    dateOfBirth: Date | null;
    age: number | null;
    ageUnit: AgeUnit | null;
  });

  let reportedAt: Date | null = null;
  const tests: ReportTest[] = visit.orderLines.map((line) => {
    const resultByParam = new Map(line.results.map((r) => [r.parameterId, r]));
    for (const r of line.results) {
      if (r.approvedAt && (!reportedAt || r.approvedAt > reportedAt)) reportedAt = r.approvedAt;
    }
    return {
      name: line.test.name,
      department: '',
      approvedBy: line.results.find((r) => r.approvedBy)?.approvedBy?.fullName ?? null,
      params: line.test.parameters.map((p) => {
        const r = resultByParam.get(p.id);
        return {
          name: p.name,
          value: r?.value ?? null,
          unit: p.unit,
          reference: referenceText(
            p.referenceRanges.map((rr) => ({
              sex: rr.sex as 'ANY' | 'MALE' | 'FEMALE',
              ageMinDays: rr.ageMinDays,
              ageMaxDays: rr.ageMaxDays,
              low: rr.low === null ? null : Number(rr.low),
              high: rr.high === null ? null : Number(rr.high),
              criticalLow: rr.criticalLow === null ? null : Number(rr.criticalLow),
              criticalHigh: rr.criticalHigh === null ? null : Number(rr.criticalHigh),
              displayText: rr.displayText,
            })),
            ageDays,
            sex,
          ),
          flag: r?.flag ?? 'NORMAL',
          isBold: p.isBold,
          isCalculated: r?.isCalculated ?? p.valueType === 'CALCULATED',
        };
      }),
    };
  });

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(d);

  return {
    letterhead: {
      labName: visit.tenant.name,
      tagline: visit.tenant.tagline,
      logoDataUrl: visit.tenant.logoDataUrl,
      licenseNo: visit.tenant.licenseNo,
      email: visit.tenant.email,
      footerNote: visit.tenant.reportFooterNote,
      branchName: visit.branch.name,
      branchAddress: visit.branch.address,
      branchPhone: visit.branch.phone,
    },
    branchName: visit.branch.name,
    branchAddress: visit.branch.address,
    branchPhone: visit.branch.phone,
    patientName: visit.patient.fullName,
    mrNo: visit.patient.mrNo,
    age,
    sex,
    mobile: visit.patient.mobile,
    slipNo: visit.slipNo,
    bookedAt: fmt(visit.bookedAt),
    reportedAt: reportedAt ? fmt(reportedAt) : null,
    doctorName: visit.doctor?.name ?? null,
    tests,
  };
}

/** Patient id that owns a visit. `tenantId` for callers without a session. */
export async function visitOwner(
  visitId: string,
  tenantId?: string,
): Promise<string | null> {
  const db = tenantId ? forTenant(tenantId) : await tenantDb();
  const v = await db.visit.findUnique({ where: { id: visitId }, select: { patientId: true } });
  return v?.patientId ?? null;
}
