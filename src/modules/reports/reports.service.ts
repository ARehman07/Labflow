import { tenantDb } from '@/core/db/context';

const PENDING = ['BOOKED', 'SAMPLE_COLLECTED', 'SAMPLE_DISPATCHED', 'SAMPLE_RECEIVED', 'IN_PROGRESS', 'RESULT_SAVED', 'RETAKE'] as const;

const n = (v: unknown) => Number(v ?? 0);
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The management reports xMed staff rely on: where money came from and went,
 * what was tested, slips per day, discounts and refunds given, and what is
 * running late. Every figure is for one branch and a date range.
 */
export const reportsService = {
  /**
   * Every rupee in or out, in time order: patient payments, refunds, other
   * income and expenses, and partner lab payments. A payment against a booking
   * from an earlier day is marked, so collected dues stand apart from today's
   * takings — the same colour-coding xMed's cash flow uses.
   */
  async cashFlow(branchId: string, start: Date, end: Date) {
    const db = await tenantDb();
    const at = { gte: start, lt: end };
    const [payments, refunds, ledger, partner, accounts] = await Promise.all([
      db.payment.findMany({
        where: { at, invoice: { visit: { branchId } } },
        select: { at: true, amount: true, method: true, account: { select: { name: true } }, invoice: { select: { visit: { select: { slipNo: true, bookedAt: true, patient: { select: { fullName: true } } } } } } },
      }),
      db.refund.findMany({
        where: { at, invoice: { visit: { branchId } } },
        select: { at: true, amount: true, reason: true, account: { select: { name: true } }, invoice: { select: { visit: { select: { slipNo: true, patient: { select: { fullName: true } } } } } } },
      }),
      db.ledgerEntry.findMany({ where: { at, branchId }, select: { at: true, type: true, method: true, category: true, amount: true, note: true } }),
      db.partnerLedgerEntry.findMany({
        where: { at, type: { in: ['PAYMENT', 'TOPUP', 'REFUND'] } },
        select: { at: true, type: true, amount: true, note: true, partnerLab: { select: { name: true } } },
      }),
      db.paymentAccount.findMany({ select: { id: true, name: true } }),
    ]);
    const accountName = new Map(accounts.map((a) => [a.id, a.name]));
    const methodLabel: Record<string, string> = { CASH: 'Cash', CARD: 'Card', ONLINE: 'Online', BANK: 'Bank' };

    type Row = { at: Date; kind: string; ref: string; text: string; account: string; amountIn: number; amountOut: number; olderDue: boolean };
    const rows: Row[] = [];
    for (const p of payments) {
      const day = new Date(p.at); day.setHours(0, 0, 0, 0);
      const v = p.invoice.visit;
      rows.push({ at: p.at, kind: 'PAYMENT', ref: v.slipNo, text: v.patient.fullName, account: p.account?.name ?? methodLabel[p.method] ?? p.method, amountIn: n(p.amount), amountOut: 0, olderDue: v.bookedAt < day });
    }
    for (const r of refunds) {
      const v = r.invoice.visit;
      rows.push({ at: r.at, kind: 'REFUND', ref: v.slipNo, text: [v.patient.fullName, r.reason].filter(Boolean).join(' · '), account: r.account?.name ?? 'Cash', amountIn: 0, amountOut: n(r.amount), olderDue: false });
    }
    for (const l of ledger) {
      const income = l.type === 'INCOME';
      rows.push({ at: l.at, kind: income ? 'INCOME' : 'EXPENSE', ref: '', text: [l.category, l.note].filter(Boolean).join(' · '), account: methodLabel[l.method] ?? l.method, amountIn: income ? n(l.amount) : 0, amountOut: income ? 0 : n(l.amount), olderDue: false });
    }
    for (const e of partner) {
      const acct = e.note?.match(/^\[acct:([^\]]+)\]/)?.[1];
      const note = (e.note ?? '').replace(/^\[acct:[^\]]+\]\s*/, '');
      const out = e.type === 'REFUND';
      rows.push({ at: e.at, kind: out ? 'PARTNER_REFUND' : 'PARTNER_PAYMENT', ref: '', text: [e.partnerLab.name, note].filter(Boolean).join(' · '), account: acct ? accountName.get(acct) ?? '' : '', amountIn: out ? 0 : n(e.amount), amountOut: out ? n(e.amount) : 0, olderDue: false });
    }
    rows.sort((a, b) => a.at.getTime() - b.at.getTime());

    const byAccount = new Map<string, { in: number; out: number }>();
    for (const r of rows) {
      const k = r.account || '—';
      const cur = byAccount.get(k) ?? { in: 0, out: 0 };
      cur.in += r.amountIn; cur.out += r.amountOut;
      byAccount.set(k, cur);
    }
    const totalIn = rows.reduce((s, r) => s + r.amountIn, 0);
    const totalOut = rows.reduce((s, r) => s + r.amountOut, 0);
    return {
      rows,
      totals: {
        in: totalIn,
        out: totalOut,
        net: totalIn - totalOut,
        collectedDues: rows.filter((r) => r.olderDue).reduce((s, r) => s + r.amountIn, 0),
      },
      byAccount: [...byAccount.entries()].map(([account, v]) => ({ account, in: v.in, out: v.out, net: v.in - v.out })).sort((a, b) => b.in - a.in),
    };
  },

  /** How many of each test, and what they brought in, with the filters xMed offers. */
  async testTotals(branchId: string, start: Date, end: Date, f: { departmentId?: string; rateGroupId?: string; partnerLabId?: string }) {
    const lines = await (await tenantDb()).orderLine.findMany({
      where: {
        status: { not: 'CANCELLED' },
        ...(f.departmentId ? { test: { departmentId: f.departmentId } } : {}),
        visit: {
          branchId,
          bookedAt: { gte: start, lt: end },
          status: { not: 'CANCELLED' },
          ...(f.rateGroupId ? { rateGroupId: f.rateGroupId } : {}),
          ...(f.partnerLabId === 'NONE' ? { partnerLabId: null } : f.partnerLabId ? { partnerLabId: f.partnerLabId } : {}),
        },
      },
      select: { testId: true, price: true, status: true, test: { select: { name: true, code: true, department: { select: { name: true } } } } },
    });
    const map = new Map<string, { test: string; code: string; department: string; count: number; revenue: number; released: number; unpriced: number }>();
    for (const l of lines) {
      const cur = map.get(l.testId) ?? { test: l.test.name, code: l.test.code, department: l.test.department.name, count: 0, revenue: 0, released: 0, unpriced: 0 };
      cur.count += 1;
      if (l.price == null) cur.unpriced += 1; else cur.revenue += n(l.price);
      if (['APPROVED', 'PRINTED', 'DELIVERED'].includes(l.status)) cur.released += 1;
      map.set(l.testId, cur);
    }
    const rows = [...map.values()].sort((a, b) => b.count - a.count || a.test.localeCompare(b.test));
    return {
      rows,
      totals: { count: rows.reduce((s, r) => s + r.count, 0), revenue: rows.reduce((s, r) => s + r.revenue, 0), unpriced: rows.reduce((s, r) => s + r.unpriced, 0) },
    };
  },

  /**
   * Totals doctor-wise: for each referring doctor, how many slips and patients
   * they sent and what those bills came to. Walk-ins with no doctor are a row
   * of their own, so the columns add up to the branch total.
   */
  async doctorTotals(branchId: string, start: Date, end: Date) {
    const visits = await (await tenantDb()).visit.findMany({
      where: { branchId, bookedAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      select: {
        patientId: true,
        doctor: { select: { id: true, name: true, clinic: true } },
        invoice: { select: { grossAmount: true, discount: true, netAmount: true, paidAmount: true } },
        _count: { select: { orderLines: { where: { status: { not: 'CANCELLED' } } } } },
      },
    });
    type Acc = { doctorId: string | null; doctor: string | null; clinic: string | null; slips: number; patients: Set<string>; tests: number; gross: number; discount: number; net: number; paid: number };
    const map = new Map<string, Acc>();
    for (const v of visits) {
      const key = v.doctor?.id ?? '';
      const cur = map.get(key) ?? { doctorId: v.doctor?.id ?? null, doctor: v.doctor?.name ?? null, clinic: v.doctor?.clinic ?? null, slips: 0, patients: new Set<string>(), tests: 0, gross: 0, discount: 0, net: 0, paid: 0 };
      cur.slips += 1;
      cur.patients.add(v.patientId);
      cur.tests += v._count.orderLines;
      cur.gross += n(v.invoice?.grossAmount);
      cur.discount += n(v.invoice?.discount);
      cur.net += n(v.invoice?.netAmount);
      cur.paid += n(v.invoice?.paidAmount);
      map.set(key, cur);
    }
    const rows = [...map.values()]
      .map((r) => ({ ...r, patients: r.patients.size, due: Math.max(0, r.net - r.paid) }))
      .sort((a, b) => b.net - a.net);
    const sum = (k: 'slips' | 'patients' | 'tests' | 'gross' | 'discount' | 'net' | 'paid' | 'due') => rows.reduce((t, r) => t + r[k], 0);
    return { rows, totals: { doctors: rows.filter((r) => r.doctorId).length, slips: sum('slips'), patients: sum('patients'), tests: sum('tests'), net: sum('net'), paid: sum('paid'), due: sum('due') } };
  },

  /**
   * Tests by results: find patients by what their results said — every HbA1c
   * above 9 last month, every reactive HBsAg. Capped, because a lab's results
   * table is the biggest thing it owns.
   */
  async resultSearch(branchId: string, start: Date, end: Date, f: {
    testId?: string; parameterId?: string; flag?: 'OUT' | 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL'; value?: string; min?: number; max?: number; releasedOnly: boolean;
  }) {
    const LIMIT = 500;
    const rows = await (await tenantDb()).resultValue.findMany({
      where: {
        value: { not: null },
        ...(f.parameterId ? { parameterId: f.parameterId } : {}),
        ...(f.flag === 'OUT' ? { flag: { not: 'NORMAL' } } : f.flag ? { flag: f.flag } : {}),
        ...(f.value ? { value: { contains: f.value } } : {}),
        ...(f.min != null || f.max != null ? { numericValue: { ...(f.min != null ? { gte: f.min } : {}), ...(f.max != null ? { lte: f.max } : {}) } } : {}),
        orderLine: {
          ...(f.testId ? { testId: f.testId } : {}),
          status: f.releasedOnly ? { in: ['APPROVED', 'PRINTED', 'DELIVERED'] } : { not: 'CANCELLED' },
          visit: { branchId, bookedAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
        },
      },
      select: {
        id: true, value: true, flag: true,
        parameter: { select: { name: true, unit: true } },
        orderLine: {
          select: {
            status: true,
            test: { select: { name: true } },
            visit: { select: { id: true, slipNo: true, bookedAt: true, patient: { select: { id: true, fullName: true, mrNo: true, age: true, ageUnit: true, sex: true, mobile: true } } } },
          },
        },
      },
      orderBy: { orderLine: { visit: { bookedAt: 'desc' } } },
      take: LIMIT + 1,
    });
    const capped = rows.length > LIMIT;
    const list = rows.slice(0, LIMIT).map((r) => ({
      id: r.id,
      date: r.orderLine.visit.bookedAt,
      visitId: r.orderLine.visit.id,
      slipNo: r.orderLine.visit.slipNo,
      patientId: r.orderLine.visit.patient.id,
      patient: r.orderLine.visit.patient.fullName,
      mrNo: r.orderLine.visit.patient.mrNo,
      age: r.orderLine.visit.patient.age,
      ageUnit: r.orderLine.visit.patient.ageUnit,
      sex: r.orderLine.visit.patient.sex,
      mobile: r.orderLine.visit.patient.mobile,
      test: r.orderLine.test.name,
      parameter: r.parameter.name,
      unit: r.parameter.unit,
      value: r.value ?? '',
      flag: r.flag,
      status: r.orderLine.status,
    }));
    return {
      rows: list,
      capped,
      totals: { results: list.length, patients: new Set(list.map((r) => r.patientId)).size, outOfRange: list.filter((r) => r.flag !== 'NORMAL').length },
    };
  },

  /**
   * Referral incentive: what each doctor earned on the slips they sent, and
   * slip by slip. Commission accrues as patients pay and is taken back out on
   * refunds, so a slip can carry a negative line — shown, not hidden, because
   * that is what the doctor is actually owed.
   */
  async referralIncentive(branchId: string, start: Date, end: Date, doctorId?: string) {
    const rows = await (await tenantDb()).commission.findMany({
      where: { at: { gte: start, lt: end }, visit: { branchId }, ...(doctorId ? { doctorId } : {}) },
      select: {
        at: true, amount: true, status: true,
        doctor: { select: { id: true, name: true, commissionPct: true } },
        visit: { select: { id: true, slipNo: true, patient: { select: { fullName: true } }, invoice: { select: { netAmount: true } } } },
      },
      orderBy: { at: 'asc' },
    });
    const details = rows.map((r) => ({
      date: r.at, doctorId: r.doctor.id, doctor: r.doctor.name, pct: n(r.doctor.commissionPct),
      visitId: r.visit.id, slipNo: r.visit.slipNo, patient: r.visit.patient.fullName, bill: n(r.visit.invoice?.netAmount),
      amount: n(r.amount), status: r.status,
    }));
    type Acc = { doctorId: string; doctor: string; pct: number; slips: Set<string>; bills: Map<string, number>; incentive: number; paid: number; unpaid: number };
    const map = new Map<string, Acc>();
    for (const d of details) {
      const cur = map.get(d.doctorId) ?? { doctorId: d.doctorId, doctor: d.doctor, pct: d.pct, slips: new Set<string>(), bills: new Map<string, number>(), incentive: 0, paid: 0, unpaid: 0 };
      cur.slips.add(d.visitId);
      cur.bills.set(d.visitId, d.bill);
      cur.incentive += d.amount;
      if (d.status === 'PAID') cur.paid += d.amount; else cur.unpaid += d.amount;
      map.set(d.doctorId, cur);
    }
    const summary = [...map.values()]
      .map((r) => ({ doctorId: r.doctorId, doctor: r.doctor, pct: r.pct, slips: r.slips.size, bills: [...r.bills.values()].reduce((t, b) => t + b, 0), incentive: r.incentive, paid: r.paid, unpaid: r.unpaid }))
      .sort((a, b) => b.incentive - a.incentive);
    return {
      summary,
      details,
      totals: { doctors: summary.length, slips: summary.reduce((t, r) => t + r.slips, 0), incentive: summary.reduce((t, r) => t + r.incentive, 0), unpaid: summary.reduce((t, r) => t + r.unpaid, 0) },
    };
  },

  /** Slips, patients and money per day. */
  async slipsByDate(branchId: string, start: Date, end: Date) {
    const visits = await (await tenantDb()).visit.findMany({
      where: { branchId, bookedAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      select: { bookedAt: true, patientId: true, invoice: { select: { grossAmount: true, discount: true, netAmount: true, paidAmount: true } } },
    });
    const map = new Map<string, { date: string; slips: number; patients: Set<string>; gross: number; discount: number; net: number; paid: number }>();
    for (const v of visits) {
      const k = dayKey(v.bookedAt);
      const cur = map.get(k) ?? { date: k, slips: 0, patients: new Set<string>(), gross: 0, discount: 0, net: 0, paid: 0 };
      cur.slips += 1;
      cur.patients.add(v.patientId);
      cur.gross += n(v.invoice?.grossAmount);
      cur.discount += n(v.invoice?.discount);
      cur.net += n(v.invoice?.netAmount);
      cur.paid += n(v.invoice?.paidAmount);
      map.set(k, cur);
    }
    const rows = [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ ...r, patients: r.patients.size, due: Math.max(0, r.net - r.paid) }));
    const sum = (k: 'slips' | 'patients' | 'gross' | 'discount' | 'net' | 'paid' | 'due') => rows.reduce((s, r) => s + r[k], 0);
    return { rows, totals: { slips: sum('slips'), patients: sum('patients'), gross: sum('gross'), discount: sum('discount'), net: sum('net'), paid: sum('paid'), due: sum('due') } };
  },

  /** Every discount given and every refund paid, with who and why. */
  async discountsAndRefunds(branchId: string, start: Date, end: Date) {
    const db = await tenantDb();
    const [discounts, refunds] = await Promise.all([
      db.invoice.findMany({
        where: { discount: { gt: 0 }, visit: { branchId, bookedAt: { gte: start, lt: end } } },
        orderBy: { createdAt: 'asc' },
        select: {
          discount: true, discountSource: true, grossAmount: true,
          careOfUser: { select: { fullName: true } },
          familyCard: { select: { mobile: true } },
          visit: { select: { slipNo: true, bookedAt: true, notes: true, status: true, patient: { select: { fullName: true } }, doctor: { select: { name: true } }, rateGroup: { select: { name: true } } } },
        },
      }),
      db.refund.findMany({
        where: { at: { gte: start, lt: end }, invoice: { visit: { branchId } } },
        orderBy: { at: 'asc' },
        select: { at: true, amount: true, reason: true, approvedById: true, account: { select: { name: true } }, invoice: { select: { visit: { select: { slipNo: true, patient: { select: { fullName: true } } } } } } },
      }),
    ]);
    const userIds = [...new Set(refunds.map((r) => r.approvedById))];
    const users = new Map((userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : []).map((u) => [u.id, u.fullName]));
    return {
      discounts: discounts.map((d) => ({
        date: d.visit.bookedAt,
        slipNo: d.visit.slipNo,
        patient: d.visit.patient.fullName,
        source: d.discountSource,
        basis: d.careOfUser?.fullName ?? d.familyCard?.mobile ?? d.visit.doctor?.name ?? d.visit.rateGroup?.name ?? null,
        gross: n(d.grossAmount),
        amount: n(d.discount),
        notes: d.visit.notes,
        cancelled: d.visit.status === 'CANCELLED',
      })),
      refunds: refunds.map((r) => ({
        date: r.at,
        slipNo: r.invoice.visit.slipNo,
        patient: r.invoice.visit.patient.fullName,
        amount: n(r.amount),
        reason: r.reason,
        account: r.account?.name ?? null,
        by: users.get(r.approvedById) ?? null,
      })),
    };
  },

  /**
   * Tests past their promised time, or due within the next two hours, that
   * are not released yet — what needs attention before a patient asks.
   */
  async delayedTests(branchId: string) {
    const soon = new Date(Date.now() + 2 * 3600_000);
    const lines = await (await tenantDb()).orderLine.findMany({
      where: { status: { in: [...PENDING] }, dueAt: { lte: soon }, visit: { branchId, status: { not: 'CANCELLED' } } },
      orderBy: { dueAt: 'asc' },
      take: 300,
      select: {
        id: true, status: true, dueAt: true, delayReason: true,
        test: { select: { name: true, department: { select: { name: true } } } },
        visit: { select: { slipNo: true, bookedAt: true, patient: { select: { fullName: true, mobile: true } }, partnerLab: { select: { name: true } }, invoice: { select: { netAmount: true, paidAmount: true } } } },
      },
    });
    const now = Date.now();
    return lines.map((l) => ({
      id: l.id,
      status: l.status,
      dueAt: l.dueAt,
      overdue: l.dueAt != null && l.dueAt.getTime() < now,
      delayReason: l.delayReason,
      test: l.test.name,
      department: l.test.department.name,
      slipNo: l.visit.slipNo,
      patient: l.visit.patient.fullName,
      mobile: l.visit.patient.mobile,
      partner: l.visit.partnerLab?.name ?? null,
      duesPending: l.visit.invoice ? n(l.visit.invoice.netAmount) - n(l.visit.invoice.paidAmount) > 0 : false,
    }));
  },
};
