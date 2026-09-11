'use server';

import { z } from 'zod';
import { requirePermission } from '@/core/rbac/guard';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { getReportData } from '@/modules/reporting/reporting.service';
import { listTests, type TestListItem } from '@/modules/catalog/catalog.service';
import { receptionService, BookingEditError } from '@/modules/reception/reception.service';
import type { ReportData } from '@/modules/reporting/report.types';
import { partnersService } from './partners.service';

const RELEASED = ['APPROVED', 'PRINTED', 'DELIVERED'];

async function partnerUser() {
  const user = await requirePermission('b2b.portal');
  if (!user.partnerLabId) throw new Error('This login is not linked to a partner lab.');
  return user as typeof user & { partnerLabId: string };
}

async function doctorUser() {
  const user = await requirePermission('doctor.portal');
  if (!user.doctorId) throw new Error('This login is not linked to a doctor.');
  return user as typeof user & { doctorId: string };
}

async function labName() {
  const t = await (await tenantDb()).tenant.findUnique({ where: { id: await currentTenantId() }, select: { name: true } });
  return t?.name ?? '';
}

export interface PortalVisitDTO {
  id: string;
  slipNo: string;
  b2bNo: string | null;
  bookedAt: string;
  patient: string;
  mrNo: string;
  tests: { name: string; status: string }[];
  released: boolean;
  allReleased: boolean;
  net: number;
}

// ── Partner lab portal ──

export async function partnerHomeAction(): Promise<{
  labName: string;
  partnerName: string;
  accountType: string;
  totals: { billed: number; credit: number; balance: number };
  visits: PortalVisitDTO[];
}> {
  const user = await partnerUser();
  const detail = await partnersService.detail(user.partnerLabId);
  if (!detail) throw new Error('Partner lab not found.');
  return {
    labName: await labName(),
    partnerName: detail.name,
    accountType: detail.accountType,
    totals: detail.totals,
    visits: detail.visits.filter((v) => v.status !== 'CANCELLED').map((v) => ({
      id: v.id, slipNo: v.slipNo, b2bNo: v.b2bNo, bookedAt: v.bookedAt, patient: v.patient, mrNo: v.mrNo,
      tests: v.tests, released: v.released,
      allReleased: v.tests.length > 0 && v.tests.every((x) => RELEASED.includes(x.status)),
      net: v.net,
    })),
  };
}

export async function partnerStatementAction() {
  const user = await partnerUser();
  const detail = await partnersService.detail(user.partnerLabId);
  if (!detail) throw new Error('Partner lab not found.');
  return { labName: await labName(), partnerName: detail.name, totals: detail.totals, statement: detail.statement };
}

export async function partnerReportAction(visitId: string): Promise<ReportData | null> {
  const user = await partnerUser();
  const visit = await (await tenantDb()).visit.findUnique({ where: { id: visitId }, select: { partnerLabId: true } });
  if (!visit || visit.partnerLabId !== user.partnerLabId) return null;
  return getReportData(visitId);
}

export async function partnerSearchTestsAction(query: string): Promise<TestListItem[]> {
  const user = await partnerUser();
  const partner = await (await tenantDb()).partnerLab.findUnique({ where: { id: user.partnerLabId }, select: { rateGroupId: true } });
  return listTests(user.branchId, query || undefined, partner?.rateGroupId ?? null);
}

const partnerBookingSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the patient’s name').max(120),
  age: z.coerce.number().int().min(0).max(150).optional(),
  ageUnit: z.enum(['YEARS', 'MONTHS', 'DAYS']).default('YEARS'),
  sex: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  mobile: z.string().trim().regex(/^0\d{10}$/u, 'Enter a valid 11-digit mobile').optional().or(z.literal('').transform(() => undefined)),
  testIds: z.array(z.string().min(1)).min(1, 'Add at least one test').max(40),
  b2bNo: z.string().trim().max(40).optional().or(z.literal('').transform(() => undefined)),
  notes: z.string().trim().max(300).optional().or(z.literal('').transform(() => undefined)),
});

/** A partner lab books a patient it is sending. Billed to its account at its rates. */
export async function partnerBookAction(input: unknown): Promise<{ ok: true; slipNo: string } | { ok: false; error: string }> {
  const user = await partnerUser();
  if (!user.branchId) return { ok: false, error: 'This login has no branch. Ask the lab to set one.' };
  const parsed = partnerBookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid booking' };
  const d = parsed.data;
  try {
    const patient = await receptionService.createPatient({ fullName: d.fullName, age: d.age, ageUnit: d.ageUnit, sex: d.sex, mobile: d.mobile });
    const { visitId } = await receptionService.bookVisit(
      {
        patientId: patient.id, testIds: d.testIds, packageIds: [], partnerLabId: user.partnerLabId, b2bNo: d.b2bNo, notes: d.notes,
        familyCardMode: 'NONE', familyCardRelation: 'OTHER', testRemarks: {}, sampleSource: 'OUTSIDE_LAB',
      } as Parameters<typeof receptionService.bookVisit>[0],
      { userId: user.id, branchId: user.branchId },
    );
    const v = await (await tenantDb()).visit.findUnique({ where: { id: visitId }, select: { slipNo: true } });
    return { ok: true, slipNo: v?.slipNo ?? '' };
  } catch (e) {
    return { ok: false, error: e instanceof BookingEditError ? e.message : 'The booking could not be made.' };
  }
}

// ── Doctor portal ──

export async function doctorHomeAction(): Promise<{
  labName: string;
  doctorName: string;
  commission: { accrued: number; paid: number };
  visits: PortalVisitDTO[];
}> {
  const user = await doctorUser();
  const db = await tenantDb();
  const [doctor, visits, commissions] = await Promise.all([
    db.doctor.findUnique({ where: { id: user.doctorId }, select: { name: true } }),
    db.visit.findMany({
      where: { doctorId: user.doctorId, status: { not: 'CANCELLED' } },
      orderBy: { bookedAt: 'desc' },
      take: 200,
      select: {
        id: true, slipNo: true, b2bNo: true, bookedAt: true,
        patient: { select: { fullName: true, mrNo: true } },
        orderLines: { where: { status: { not: 'CANCELLED' } }, select: { status: true, test: { select: { name: true } } } },
        invoice: { select: { netAmount: true } },
      },
    }),
    db.commission.findMany({ where: { doctorId: user.doctorId }, select: { amount: true, status: true } }),
  ]);
  return {
    labName: await labName(),
    doctorName: doctor?.name ?? '',
    commission: {
      accrued: commissions.filter((c) => c.status !== 'PAID').reduce((s, c) => s + Number(c.amount), 0),
      paid: commissions.filter((c) => c.status === 'PAID').reduce((s, c) => s + Number(c.amount), 0),
    },
    visits: visits.map((v) => {
      const tests = v.orderLines.map((l) => ({ name: l.test.name, status: l.status }));
      return {
        id: v.id, slipNo: v.slipNo, b2bNo: v.b2bNo, bookedAt: v.bookedAt.toISOString(),
        patient: v.patient.fullName, mrNo: v.patient.mrNo, tests,
        released: tests.some((x) => RELEASED.includes(x.status)),
        allReleased: tests.length > 0 && tests.every((x) => RELEASED.includes(x.status)),
        net: v.invoice ? Number(v.invoice.netAmount) : 0,
      };
    }),
  };
}

export async function doctorReportAction(visitId: string): Promise<ReportData | null> {
  const user = await doctorUser();
  const visit = await (await tenantDb()).visit.findUnique({ where: { id: visitId }, select: { doctorId: true } });
  if (!visit || visit.doctorId !== user.doctorId) return null;
  return getReportData(visitId);
}
