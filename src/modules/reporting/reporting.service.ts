import { tenantDb } from '@/core/db/context';
import { forTenant } from '@/core/db/tenant';
import { pickRange, ageInDays, interpretCutoff, type ReferenceRangeDef, type AgeUnit } from '@/modules/lab/calc-engine';
import type { ReportData, ReportTest } from './report.types';

const RELEASED = ['APPROVED', 'PRINTED', 'DELIVERED'] as const;

/** How many earlier visits a report printed with history shows per test. */
export const HISTORY_COLUMNS = 3;

const num = (v: string | null | undefined) => {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return String(v).trim() !== '' && Number.isFinite(n) ? n : null;
};

/**
 * Earlier results for the same tests, found through the patient's record — the
 * MR number is what ties a returning patient's visits together.
 *
 * A doctor reading HbA1c 7.9 reads it differently when the last three were
 * 9.1, 8.6 and 8.2. Only released results count, only visits booked before this
 * one, and only the last few, so the page stays an A4 report and not a ledger.
 */
function historyFor(
  line: { testId: string; test: { parameters: { id: string }[] } },
  rows: { parameterId: string; value: string | null; flag: string; orderLine: { testId: string; visit: { id: string; slipNo: string; bookedAt: Date } } }[],
  fmtDate: (d: Date) => string,
) {
  const own = new Set(line.test.parameters.map((p) => p.id));
  const mine = rows.filter((r) => own.has(r.parameterId));
  const columns: { visitId: string; slipNo: string; date: string }[] = [];
  const seen = new Set<string>();
  for (const r of mine) {
    if (seen.has(r.orderLine.visit.id)) continue;
    seen.add(r.orderLine.visit.id);
    columns.push({ visitId: r.orderLine.visit.id, slipNo: r.orderLine.visit.slipNo, date: fmtDate(r.orderLine.visit.bookedAt) });
    if (columns.length === HISTORY_COLUMNS) break;
  }
  const cell = new Map(mine.map((r) => [`${r.orderLine.visit.id}:${r.parameterId}`, r]));
  return { columns, cell };
}

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
        where: { status: { in: [...RELEASED] } },
        orderBy: { createdAt: 'asc' },
        include: {
          test: { include: { parameters: { orderBy: { sortOrder: 'asc' }, include: { referenceRanges: true } } } },
          results: { include: { approvedBy: true } },
          outsourcedTo: { select: { name: true } },
          culture: { include: { sensitivities: { orderBy: { sortOrder: 'asc' } } } },
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

  const shortDate = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).format(d);
  const paramIds = visit.orderLines.flatMap((l) => l.test.parameters.map((p) => p.id));
  const earlier = paramIds.length === 0 ? [] : await db.resultValue.findMany({
    where: {
      parameterId: { in: paramIds },
      value: { not: null },
      orderLine: {
        status: { in: [...RELEASED] },
        visitId: { not: visit.id },
        visit: { patientId: visit.patientId, bookedAt: { lt: visit.bookedAt }, status: { not: 'CANCELLED' } },
      },
    },
    select: {
      parameterId: true, value: true, flag: true,
      orderLine: { select: { testId: true, visit: { select: { id: true, slipNo: true, bookedAt: true } } } },
    },
    orderBy: { orderLine: { visit: { bookedAt: 'desc' } } },
    take: 3000,
  });

  let reportedAt: Date | null = null;
  const tests: ReportTest[] = visit.orderLines.map((line) => {
    const { columns, cell } = historyFor(line, earlier, shortDate);
    const resultByParam = new Map(line.results.map((r) => [r.parameterId, r]));
    for (const r of line.results) {
      if (r.approvedAt && (!reportedAt || r.approvedAt > reportedAt)) reportedAt = r.approvedAt;
    }
    return {
      name: line.test.name,
      department: '',
      approvedBy: line.results.find((r) => r.approvedBy)?.approvedBy?.fullName ?? null,
      history: columns,
      methodNote: line.test.methodNote ?? null,
      remarks: line.remarks ?? null,
      performedAt: line.outsourcedTo?.name ?? null,
      culture: line.culture
        ? {
            growth: line.culture.growth,
            organism: line.culture.organism,
            colonyCount: line.culture.colonyCount,
            incubation: line.culture.incubation,
            remarks: line.culture.remarks,
            sensitivities: line.culture.sensitivities.map((x) => ({ antibiotic: x.antibiotic, result: x.result, mic: x.mic })),
          }
        : null,
      params: line.test.parameters.map((p) => {
        const r = resultByParam.get(p.id);
        const prevRows = columns.map((c) => cell.get(`${c.visitId}:${p.id}`) ?? null);
        const now = num(r?.value);
        const last = prevRows.map((x) => num(x?.value)).find((x) => x != null) ?? null;
        return {
          previous: prevRows.map((x) => x?.value ?? null),
          previousFlags: prevRows.map((x) => x?.flag ?? null),
          trend: now == null || last == null ? null : now > last ? 'UP' : now < last ? 'DOWN' : 'SAME',
          name: p.name,
          value: r?.value ?? null,
          unit: p.unit,
          reference: p.valueType === 'CUTOFF' && p.cutoff != null ? `Cut-off: ${Number(p.cutoff)}` : referenceText(
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
          interpretation: p.valueType === 'CUTOFF'
            ? interpretCutoff(num(r?.value), p.cutoff != null ? Number(p.cutoff) : null, p.positiveLabel, p.negativeLabel)
            : null,
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
    hasHistory: tests.some((x) => x.history.length > 0),
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
