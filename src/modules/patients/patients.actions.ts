'use server';

import { can, currentUser, requirePermission } from '@/core/rbac/guard';
import { parseScan } from '@/lib/scan';
import { tenantDb } from '@/core/db/context';
import type { PatientDTO } from '@/modules/reception/reception.actions';

export interface PatientVisitDTO {
  id: string;
  slipNo: string;
  bookedAt: string;
  doctor: string | null;
  tests: { name: string; status: string }[];
  /** At least one test released, so there is a report to open. */
  reportReady: boolean;
  invoice: { id: string; net: number; paid: number; status: string } | null;
}

export interface PatientProfileDTO {
  id: string;
  mrNo: string;
  fullName: string;
  age: number | null;
  sex: string | null;
  mobile: string | null;
  address: string | null;
  since: string;
  card: { mobile: string; discountPct: number; isActive: boolean; holder: boolean } | null;
  visits: PatientVisitDTO[];
  totals: { visits: number; billed: number; outstanding: number };
  can: { book: boolean; billing: boolean; report: boolean };
}

const RELEASED = ['APPROVED', 'PRINTED', 'DELIVERED'];

/** Anyone who deals with patients may open one: the counter, the bench, billing. */
async function mayViewPatients() {
  const perms = await Promise.all([
    can('visit.create'), can('patient.manage'), can('billing.view'), can('result.enter'),
  ]);
  return perms.some(Boolean);
}

/**
 * Everything about one patient, in one place.
 *
 * There was no such page: a patient's visits lived in Billing, their results
 * on the Lab board, their card on Family Cards, and answering "has this person
 * been here before, and do they owe anything?" meant visiting all three.
 */
export async function getPatientProfileAction(patientId: string): Promise<PatientProfileDTO | null> {
  if (!(await mayViewPatients())) return null;
  const [book, billing, report] = await Promise.all([can('visit.create'), can('billing.view'), can('report.print')]);

  const db = await tenantDb();
  const p = await db.patient.findUnique({
    where: { id: patientId },
    include: {
      visits: {
        orderBy: { bookedAt: 'desc' },
        take: 50,
        include: {
          orderLines: { orderBy: { createdAt: 'asc' }, select: { status: true, test: { select: { name: true } } } },
          invoice: { select: { id: true, netAmount: true, paidAmount: true, status: true } },
          doctor: { select: { name: true } },
        },
      },
      primaryOfCards: { take: 1, select: { mobile: true, discountPct: true, isActive: true } },
      cardMemberships: {
        where: { removedAt: null },
        take: 1,
        select: { card: { select: { mobile: true, discountPct: true, isActive: true } } },
      },
    },
  });
  if (!p) return null;

  const held = p.primaryOfCards[0];
  const member = p.cardMemberships[0]?.card;
  const cardRow = held ?? member;

  const visits: PatientVisitDTO[] = p.visits.map((v) => ({
    id: v.id,
    slipNo: v.slipNo,
    bookedAt: v.bookedAt.toISOString(),
    doctor: v.doctor?.name ?? null,
    tests: v.orderLines.map((l) => ({ name: l.test.name, status: l.status })),
    reportReady: v.orderLines.some((l) => RELEASED.includes(l.status)),
    invoice: v.invoice
      ? { id: v.invoice.id, net: Number(v.invoice.netAmount), paid: Number(v.invoice.paidAmount), status: v.invoice.status }
      : null,
  }));

  return {
    id: p.id,
    mrNo: p.mrNo,
    fullName: p.fullName,
    age: p.age,
    sex: p.sex,
    mobile: p.mobile,
    address: p.address,
    since: p.createdAt.toISOString(),
    card: cardRow
      ? { mobile: cardRow.mobile, discountPct: Number(cardRow.discountPct), isActive: cardRow.isActive, holder: !!held }
      : null,
    visits,
    totals: {
      visits: visits.length,
      billed: visits.reduce((s, v) => s + (v.invoice?.net ?? 0), 0),
      outstanding: visits.reduce((s, v) => s + Math.max(0, (v.invoice?.net ?? 0) - (v.invoice?.paid ?? 0)), 0),
    },
    can: { book, billing, report },
  };
}

/** One patient in the shape the booking screen selects, for "book again". */
export async function getPatientForBookingAction(patientId: string): Promise<PatientDTO | null> {
  await requirePermission('visit.create');
  const p = await (await tenantDb()).patient.findUnique({ where: { id: patientId } });
  if (!p) return null;
  return {
    id: p.id, mrNo: p.mrNo, fullName: p.fullName, age: p.age, ageUnit: p.ageUnit, sex: p.sex, mobile: p.mobile,
    cnic: p.cnic, email: p.email, dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
    hasPhoto: Boolean(p.photoDataUrl),
  };
}

export interface ScanHitDTO {
  visitId: string;
  slipNo: string;
  patientName: string;
  /** Where this person would want to land: the lab card for a tube, the slip for a slip. */
  href: string;
}

/**
 * The visit a scanned tube label, slip QR or typed slip number belongs to.
 *
 * A tube is scanned at the bench, so it opens the Lab board on that patient;
 * a slip is scanned at the counter, so it opens the slip — each falling back
 * to whatever the person is allowed to open.
 */
export async function findVisitByScanAction(raw: string): Promise<ScanHitDTO | null> {
  if (!(await mayViewPatients())) return null;
  const scan = parseScan(String(raw ?? '').slice(0, 80));
  if (!scan) return null;
  const user = await currentUser();
  const db = await tenantDb();
  const select = { id: true, slipNo: true, patientId: true, patient: { select: { fullName: true } } } as const;

  const bySample = scan.kind === 'barcode'
    ? (await db.sample.findFirst({ where: { barcode: scan.barcode }, select: { visit: { select } } }))?.visit ?? null
    : null;
  const visit = bySample ?? (user.branchId
    ? await db.visit.findFirst({ where: { branchId: user.branchId, slipNo: scan.slipNo }, select })
    : null);
  if (!visit) return null;

  const [reception, enter, collect] = await Promise.all([can('visit.create'), can('result.enter'), can('sample.collect')]);
  const lab = enter || collect;
  const href = lab && (scan.kind === 'barcode' || !reception)
    ? `/lab?q=${encodeURIComponent(visit.slipNo)}`
    : reception
      ? `/reception/${visit.id}`
      : `/patients/${visit.patientId}`;
  return { visitId: visit.id, slipNo: visit.slipNo, patientName: visit.patient.fullName, href };
}
