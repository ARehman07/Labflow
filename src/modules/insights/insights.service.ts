import { tenantDb } from '@/core/db/context';

const RELEASED = ['APPROVED', 'PRINTED', 'DELIVERED'];
const CLOSED = [...RELEASED, 'CANCELLED'];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface CriticalPreview {
  id: string;
  patientName: string;
  mrNo: string;
  mobile: string | null;
  testName: string;
  parameterName: string;
  value: string | null;
  unit: string | null;
  openedAt: string;
}

export interface DashboardData {
  revenueToday: number;
  patientsToday: number;
  pendingResults: number;
  overdueTat: number;
  revenue7d: { label: string; value: number }[];
  testMix: { name: string; count: number }[];
  doctors: { name: string; count: number }[];
  pipeline: { status: string; count: number }[];

  // ── Context, so a number means something ──
  /** Same measure, yesterday. A figure with nothing to compare it to is trivia. */
  revenueYesterday: number;
  patientsYesterday: number;

  // ── What needs a human ──
  criticalOpen: number;
  /** The actual patients behind the count — a number cannot be phoned. */
  criticalPreview: CriticalPreview[];
  notifiableOpen: number;
  awaitingApproval: number;
  duesOutstanding: number;
  duesCount: number;

  // ── How today is going ──
  testsCompletedToday: number;
  /** Share of today's released tests that beat their promised turnaround. */
  onTimeRate: number | null;
}

export async function getDashboard(branchId: string): Promise<DashboardData> {
  const today = startOfToday();
  const now = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);

  const yStart = new Date(today);
  yStart.setDate(yStart.getDate() - 1);

  const db = await tenantDb();

  const [
    paymentsToday,
    visitsToday,
    pendingResults,
    overdueTat,
    payments7d,
    mixGroups,
    doctorGroups,
    pipelineGroups,
    paymentsYesterday,
    visitsYesterday,
    criticalOpen,
    criticalRows,
    notifiableOpen,
    awaitingApproval,
    unpaidInvoices,
    approvedToday,
  ] = await Promise.all([
    (await tenantDb()).payment.findMany({ where: { at: { gte: today }, invoice: { visit: { branchId } } }, select: { amount: true } }),
    (await tenantDb()).visit.count({ where: { branchId, bookedAt: { gte: today } } }),
    (await tenantDb()).orderLine.count({ where: { visit: { branchId }, status: { notIn: CLOSED } } }),
    (await tenantDb()).orderLine.count({ where: { visit: { branchId }, status: { notIn: CLOSED }, dueAt: { lt: now } } }),
    (await tenantDb()).payment.findMany({ where: { at: { gte: weekAgo }, invoice: { visit: { branchId } } }, select: { amount: true, at: true } }),
    (await tenantDb()).orderLine.groupBy({ by: ['testId'], where: { visit: { branchId } }, _count: { testId: true }, orderBy: { _count: { testId: 'desc' } }, take: 6 }),
    (await tenantDb()).visit.groupBy({ by: ['doctorId'], where: { branchId, doctorId: { not: null } }, _count: { doctorId: true }, orderBy: { _count: { doctorId: 'desc' } }, take: 5 }),
    (await tenantDb()).orderLine.groupBy({ by: ['status'], where: { visit: { branchId } }, _count: { status: true } }),

    db.payment.findMany({
      where: { at: { gte: yStart, lt: today }, invoice: { visit: { branchId } } },
      select: { amount: true },
    }),
    db.visit.count({ where: { branchId, bookedAt: { gte: yStart, lt: today } } }),
    db.criticalNotification.count({ where: { notifiedAt: null } }),
    db.criticalNotification.findMany({
      where: { notifiedAt: null },
      take: 4,
      orderBy: { createdAt: 'asc' },
      include: {
        resultValue: {
          include: {
            parameter: { select: { name: true, unit: true } },
            orderLine: {
              include: {
                test: { select: { name: true } },
                visit: { include: { patient: { select: { fullName: true, mrNo: true, mobile: true } } } },
              },
            },
          },
        },
      },
    }),
    db.notifiableReport.count({ where: { reportedAt: null } }),
    db.orderLine.count({ where: { visit: { branchId }, status: 'RESULT_SAVED' } }),
    db.invoice.findMany({
      where: { visit: { branchId }, status: { in: ['DUE', 'PARTIAL'] } },
      select: { netAmount: true, paidAmount: true },
    }),
    // Approvals are the moment a test is finished, so on-time is measured here.
    db.workflowEvent.findMany({
      where: { at: { gte: today }, toState: 'APPROVED' },
      select: { at: true, orderLine: { select: { dueAt: true } } },
    }),
  ]);

  const revenueToday = paymentsToday.reduce((s, p) => s + Number(p.amount), 0);

  // Bucket last-7-day revenue by day.
  const days: { label: string; value: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekAgo);
    d.setDate(d.getDate() + i);
    days.push({ label: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(d), value: 0 });
  }
  for (const p of payments7d) {
    const idx = Math.floor((new Date(p.at).setHours(0, 0, 0, 0) - weekAgo.getTime()) / 86_400_000);
    if (idx >= 0 && idx < 7) days[idx].value += Number(p.amount);
  }

  // Resolve test + doctor names.
  const testIds = mixGroups.map((g) => g.testId);
  const doctorIds = doctorGroups.map((g) => g.doctorId).filter((x): x is string => !!x);
  const [tests, doctors] = await Promise.all([
    (await tenantDb()).test.findMany({ where: { id: { in: testIds } }, select: { id: true, name: true } }),
    (await tenantDb()).doctor.findMany({ where: { id: { in: doctorIds } }, select: { id: true, name: true } }),
  ]);
  const testName = new Map(tests.map((t) => [t.id, t.name]));
  const doctorName = new Map(doctors.map((d) => [d.id, d.name]));

  const onTimeTotal = approvedToday.length;
  const onTimeMet = approvedToday.filter(
    (e) => !e.orderLine.dueAt || e.at <= e.orderLine.dueAt,
  ).length;

  return {
    revenueToday,
    patientsToday: visitsToday,
    revenueYesterday: paymentsYesterday.reduce((s2, p) => s2 + Number(p.amount), 0),
    patientsYesterday: visitsYesterday,
    criticalOpen,
    criticalPreview: criticalRows.map((c) => ({
      id: c.id,
      patientName: c.resultValue.orderLine.visit.patient.fullName,
      mrNo: c.resultValue.orderLine.visit.patient.mrNo,
      mobile: c.resultValue.orderLine.visit.patient.mobile,
      testName: c.resultValue.orderLine.test.name,
      parameterName: c.resultValue.parameter.name,
      value: c.resultValue.value,
      unit: c.resultValue.parameter.unit,
      openedAt: c.createdAt.toISOString(),
    })),
    notifiableOpen,
    awaitingApproval,
    duesOutstanding: unpaidInvoices.reduce(
      (s2, i) => s2 + (Number(i.netAmount) - Number(i.paidAmount)),
      0,
    ),
    duesCount: unpaidInvoices.length,
    testsCompletedToday: onTimeTotal,
    onTimeRate: onTimeTotal === 0 ? null : Math.round((onTimeMet / onTimeTotal) * 100),
    pendingResults,
    overdueTat,
    revenue7d: days,
    testMix: mixGroups.map((g) => ({ name: testName.get(g.testId) ?? '—', count: g._count.testId })),
    doctors: doctorGroups.map((g) => ({ name: doctorName.get(g.doctorId ?? '') ?? '—', count: g._count.doctorId })),
    pipeline: pipelineGroups.map((g) => ({ status: g.status, count: g._count.status })),
  };
}
