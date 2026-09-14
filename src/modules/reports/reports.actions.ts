'use server';

import { can, currentUser } from '@/core/rbac/guard';
import { tenantDb } from '@/core/db/context';
import { reportsService } from './reports.service';

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/u.test(s);

async function scope(from: string, to: string, who: 'money' | 'results' = 'money') {
  const allowed = who === 'money'
    ? (await can('finance.view')) || (await can('insights.view'))
    // Results carry patients' findings, so the people who read them anyway: approvers, report printers, management.
    : (await can('result.approve')) || (await can('report.print')) || (await can('insights.view'));
  if (!allowed) throw new Error('You cannot view reports.');
  const user = await currentUser();
  if (!user.branchId) throw new Error('Your account has no branch assigned.');
  if (!isDay(from) || !isDay(to)) throw new Error('Choose a valid date range.');
  let start = new Date(`${from}T00:00:00`);
  let end = new Date(`${to}T00:00:00`);
  if (start > end) [start, end] = [end, start];
  end.setDate(end.getDate() + 1);
  if (end.getTime() - start.getTime() > 367 * 86_400_000) throw new Error('Choose a range of a year or less.');
  return { branchId: user.branchId, start, end };
}

export async function reportOptionsAction() {
  const db = await tenantDb();
  const [departments, rateGroups, partners, tests, doctors] = await Promise.all([
    db.department.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.rateGroup.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.partnerLab.findMany({ where: { direction: 'INWARD' }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.test.findMany({ where: { parameters: { some: {} } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.doctor.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  return { departments, rateGroups, partners, tests, doctors };
}

export async function cashFlowReportAction(from: string, to: string) {
  const s = await scope(from, to);
  const r = await reportsService.cashFlow(s.branchId, s.start, s.end);
  return { ...r, rows: r.rows.map((x) => ({ ...x, at: x.at.toISOString() })) };
}

export async function testTotalsReportAction(from: string, to: string, filters: { departmentId?: string; rateGroupId?: string; partnerLabId?: string } = {}) {
  const s = await scope(from, to);
  return reportsService.testTotals(s.branchId, s.start, s.end, filters);
}

export async function slipsByDateReportAction(from: string, to: string) {
  const s = await scope(from, to);
  return reportsService.slipsByDate(s.branchId, s.start, s.end);
}

export async function discountsReportAction(from: string, to: string) {
  const s = await scope(from, to);
  const r = await reportsService.discountsAndRefunds(s.branchId, s.start, s.end);
  return {
    discounts: r.discounts.map((x) => ({ ...x, date: x.date.toISOString() })),
    refunds: r.refunds.map((x) => ({ ...x, date: x.date.toISOString() })),
  };
}

export async function delayedTestsReportAction() {
  const allowed = (await can('finance.view')) || (await can('insights.view')) || (await can('result.approve')) || (await can('report.print'));
  if (!allowed) throw new Error('You cannot view reports.');
  const user = await currentUser();
  if (!user.branchId) return [];
  const rows = await reportsService.delayedTests(user.branchId);
  return rows.map((r) => ({ ...r, dueAt: r.dueAt ? r.dueAt.toISOString() : null }));
}

export async function doctorTotalsReportAction(from: string, to: string) {
  const s = await scope(from, to);
  return reportsService.doctorTotals(s.branchId, s.start, s.end);
}

const FLAGS = ['NORMAL', 'HIGH', 'LOW', 'CRITICAL'] as const;
type Flag = (typeof FLAGS)[number];

export async function resultSearchReportAction(from: string, to: string, f: {
  testId?: string; parameterId?: string; flag?: string; value?: string; min?: string; max?: string; releasedOnly?: boolean;
}) {
  const s = await scope(from, to, 'results');
  const num = (v?: string) => (v != null && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const flag = f.flag === 'OUT' ? 'OUT' : (FLAGS as readonly string[]).includes(f.flag ?? '') ? (f.flag as Flag) : undefined;
  const r = await reportsService.resultSearch(s.branchId, s.start, s.end, {
    testId: f.testId || undefined,
    parameterId: f.parameterId || undefined,
    flag,
    value: f.value?.trim().slice(0, 60) || undefined,
    min: num(f.min),
    max: num(f.max),
    releasedOnly: f.releasedOnly !== false,
  });
  return { ...r, rows: r.rows.map((x) => ({ ...x, date: x.date.toISOString() })) };
}

/** The result lines a test has, for narrowing a results search to one of them. */
export async function testParametersReportAction(testId: string) {
  if (!((await can('result.approve')) || (await can('report.print')) || (await can('insights.view')))) return [];
  return (await tenantDb()).testParameter.findMany({ where: { testId }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, unit: true } });
}

export async function referralIncentiveReportAction(from: string, to: string, doctorId?: string) {
  const s = await scope(from, to);
  const r = await reportsService.referralIncentive(s.branchId, s.start, s.end, doctorId || undefined);
  return { ...r, details: r.details.map((x) => ({ ...x, date: x.date.toISOString() })) };
}
