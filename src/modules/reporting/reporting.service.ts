import { tenantDb } from '@/core/db/context';
import { forTenant } from '@/core/db/tenant';
import { pickRange, ageInDays, interpretCutoff, type ReferenceRangeDef, type AgeUnit } from '@/modules/lab/calc-engine';
import type { ReportData, ReportTest } from './report.types';
import { analyteKey, historyCutoff, pickHistory, sameUnit, type EarlierRow } from './history';

const RELEASED = ['APPROVED', 'PRINTED', 'DELIVERED'] as const;

/** How many earlier visits a report printed with history shows per test, unless the lab sets its own. */
export const HISTORY_COLUMNS = 3;

const num = (v: string | null | undefined) => {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return String(v).trim() !== '' && Number.isFinite(n) ? n : null;
};

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
          reportHistoryColumns: true, reportHistoryByDefault: true, reportHistoryMonths: true,
          reportShowHeader: true, reportShowFooter: true, reportTopMarginMm: true,
          reportBottomMarginMm: true, reportFont: true, reportFontScale: true,
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
  // Earlier results for the same analytes, through the patient's record — the
  // MR number ties a returning patient's visits together. Only released
  // results, only visits booked before this one and within the lab's window,
  // so the page stays an A4 report and not a ledger. See ./history.
  const allParams = visit.orderLines.flatMap((l) => l.test.parameters);
  const codes = [...new Set(allParams.map((p) => p.analyteCode?.trim().toUpperCase()).filter((c): c is string => !!c))];
  const plainIds = allParams.filter((p) => !p.analyteCode?.trim()).map((p) => p.id);
  const since = historyCutoff(visit.bookedAt, visit.tenant.reportHistoryMonths);
  const earlierRows = allParams.length === 0 ? [] : await db.resultValue.findMany({
    where: {
      OR: [
        ...(plainIds.length > 0 ? [{ parameterId: { in: plainIds } }] : []),
        ...(codes.length > 0 ? [{ parameter: { analyteCode: { in: codes } } }] : []),
      ],
      value: { not: null },
      orderLine: {
        status: { in: [...RELEASED] },
        visitId: { not: visit.id },
        visit: {
          patientId: visit.patientId,
          bookedAt: { lt: visit.bookedAt, ...(since ? { gte: since } : {}) },
          status: { not: 'CANCELLED' },
        },
      },
    },
    select: {
      value: true, flag: true,
      parameter: { select: { id: true, analyteCode: true, unit: true } },
      orderLine: { select: { visit: { select: { id: true, slipNo: true, bookedAt: true } } } },
    },
    orderBy: { orderLine: { visit: { bookedAt: 'desc' } } },
    take: 3000,
  });
  const earlier: EarlierRow[] = earlierRows.map((r) => ({
    key: analyteKey(r.parameter), value: r.value, flag: r.flag, unit: r.parameter.unit, visit: r.orderLine.visit,
  }));

  let reportedAt: Date | null = null;
  const tests: ReportTest[] = visit.orderLines.map((line) => {
    const resultByParam = new Map(line.results.map((r) => [r.parameterId, r]));
    // History columns come only from what this report prints, so none is empty.
    const printedKeys = line.test.parameters
      .filter((p) => { const v = resultByParam.get(p.id)?.value; return v != null && String(v).trim() !== ''; })
      .map(analyteKey);
    const picked = pickHistory(printedKeys, earlier, visit.tenant.reportHistoryColumns);
    const cell = picked.cell;
    const columns = picked.columns.map((c) => ({ visitId: c.visitId, slipNo: c.slipNo, date: shortDate(c.bookedAt) }));
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
        const key = analyteKey(p);
        const prevRows = columns.map((c) => cell.get(`${c.visitId}:${key}`) ?? null);
        const now = num(r?.value);
        // The arrow only compares like with like: a value in another unit is shown, not ranked.
        const last = prevRows
          .filter((x) => x != null && sameUnit(x.unit, p.unit))
          .map((x) => num(x?.value))
          .find((x) => x != null) ?? null;
        return {
          previous: prevRows.map((x) => x?.value ?? null),
          previousFlags: prevRows.map((x) => x?.flag ?? null),
          previousUnits: prevRows.map((x) => (x != null && !sameUnit(x.unit, p.unit) ? (x.unit ?? '') : null)),
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
    historyByDefault: visit.tenant.reportHistoryByDefault,
    layout: {
      showHeader: visit.tenant.reportShowHeader,
      showFooter: visit.tenant.reportShowFooter,
      topMarginMm: visit.tenant.reportTopMarginMm,
      bottomMarginMm: visit.tenant.reportBottomMarginMm,
      font: visit.tenant.reportFont,
      fontScale: visit.tenant.reportFontScale,
    },
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
