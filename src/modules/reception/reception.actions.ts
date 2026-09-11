'use server';

import { z } from 'zod';
import { requirePermission } from '@/core/rbac/guard';
import { listTests, priceTests, type TestListItem } from '@/modules/catalog/catalog.service';
import { receptionService, BookingEditError } from './reception.service';
import { patientCreateSchema, bookVisitSchema } from './reception.schema';

export interface PatientDTO {
  id: string;
  mrNo: string;
  fullName: string;
  age: number | null;
  /** YEARS, MONTHS or DAYS. */
  ageUnit?: string | null;
  sex: string | null;
  mobile: string | null;
  cnic?: string | null;
  email?: string | null;
  /** yyyy-mm-dd */
  dateOfBirth?: string | null;
  hasPhoto?: boolean;
}

const toPatientDTO = (p: {
  id: string;
  mrNo: string;
  fullName: string;
  age: number | null;
  ageUnit?: string | null;
  sex: string | null;
  mobile: string | null;
  cnic?: string | null;
  email?: string | null;
  dateOfBirth?: Date | null;
  photoDataUrl?: string | null;
}): PatientDTO => ({
  id: p.id,
  mrNo: p.mrNo,
  fullName: p.fullName,
  age: p.age,
  ageUnit: p.ageUnit ?? null,
  sex: p.sex,
  mobile: p.mobile,
  cnic: p.cnic ?? null,
  email: p.email ?? null,
  dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
  hasPhoto: Boolean(p.photoDataUrl),
});

export async function searchPatientsAction(query: string): Promise<PatientDTO[]> {
  await requirePermission('visit.create');
  const patients = await receptionService.searchPatients(query);
  return patients.map(toPatientDTO);
}

export async function searchTestsAction(query: string, rateGroupId?: string | null): Promise<TestListItem[]> {
  const user = await requirePermission('visit.create');
  return listTests(user.branchId, query || undefined, rateGroupId || null);
}

/** Current prices for tests already in the cart, from a price list (or standard). */
export async function priceTestsAction(testIds: string[], rateGroupId?: string | null): Promise<Record<string, number>> {
  const user = await requirePermission('visit.create');
  const ids = Array.isArray(testIds) ? testIds.filter((x) => typeof x === 'string').slice(0, 100) : [];
  const map = await priceTests(user.branchId, ids, { rateGroupId: rateGroupId || null });
  return Object.fromEntries([...map.entries()].map(([id, v]) => [id, v.price]));
}

export async function listDoctorsAction(): Promise<{ id: string; name: string }[]> {
  await requirePermission('visit.create');
  const docs = await receptionService.listDoctors();
  return docs.map((d) => ({ id: d.id, name: d.name }));
}

export type CreatePatientResult =
  | { ok: true; patient: PatientDTO }
  | { ok: false; error: string };

export async function createPatientAction(input: unknown): Promise<CreatePatientResult> {
  await requirePermission('patient.manage');
  const parsed = patientCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid patient details' };
  }
  const patient = await receptionService.createPatient(parsed.data);
  return { ok: true, patient: toPatientDTO(patient) };
}

export type BookResult = { ok: true; visitId: string } | { ok: false; error: string };

export async function bookVisitAction(input: unknown): Promise<BookResult> {
  const user = await requirePermission('visit.create');
  if (!user.branchId) return { ok: false, error: 'Your account has no branch assigned.' };

  const parsed = bookVisitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid booking' };
  }

  try {
    const { visitId } = await receptionService.bookVisit(parsed.data, {
      userId: user.id,
      branchId: user.branchId,
    });
    return { ok: true, visitId };
  } catch (e) {
    if (e instanceof BookingEditError) return { ok: false, error: e.message };
    return { ok: false, error: 'Booking failed. Please check the selected tests and try again.' };
  }
}

// ── Before registering: is this person already on file? ──
export interface SimilarPatientDTO {
  patient: PatientDTO;
  sameMobile: boolean;
  sameName: boolean;
}

export async function findSimilarPatientsAction(input: { fullName?: string; mobile?: string }): Promise<SimilarPatientDTO[]> {
  await requirePermission('patient.manage');
  const rows = await receptionService.findSimilarPatients({
    fullName: String(input?.fullName ?? '').slice(0, 120),
    mobile: String(input?.mobile ?? '').slice(0, 20),
  });
  return rows.map((r) => ({ patient: toPatientDTO(r.patient), sameMobile: r.sameMobile, sameName: r.sameName }));
}

// ── Faster booking ──
export interface QuickTest {
  id: string;
  name: string;
  price: number;
}

export async function lastVisitTestsAction(patientId: string): Promise<{ bookedAt: string; tests: QuickTest[] } | null> {
  const user = await requirePermission('visit.create');
  if (typeof patientId !== 'string' || !patientId) return null;
  const r = await receptionService.lastVisitTests(patientId, user.branchId);
  return r ? { bookedAt: r.bookedAt.toISOString(), tests: r.tests } : null;
}

export async function popularTestsAction(): Promise<QuickTest[]> {
  const user = await requirePermission('visit.create');
  if (!user.branchId) return [];
  return receptionService.popularTests(user.branchId);
}

const quickDoctorSchema = z.object({
  name: z.string().trim().min(2, 'Enter the doctor’s name').max(120),
  clinic: z.string().trim().max(120).optional().or(z.literal('').transform(() => undefined)),
});

export async function quickAddDoctorAction(
  input: unknown,
): Promise<{ ok: true; doctor: { id: string; name: string } } | { ok: false; error: string }> {
  await requirePermission('visit.create');
  const parsed = quickDoctorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };
  return { ok: true, doctor: await receptionService.quickAddDoctor(parsed.data) };
}

// ── Changing a booking after the slip is printed ──
const modifyBookingSchema = z.object({
  visitId: z.string().min(1),
  addTestIds: z.array(z.string().min(1)).max(50).default([]),
  removeLineIds: z.array(z.string().min(1)).max(50).default([]),
  notes: z.string().max(500).nullable().optional(),
});

export async function modifyBookingAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission('visit.modify');
  const parsed = modifyBookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid request' };
  try {
    await receptionService.modifyBooking(parsed.data, user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof BookingEditError ? e.message : 'The booking could not be changed.' };
  }
}

export async function cancelBookingAction(
  visitId: string,
  reason?: string,
): Promise<{ ok: true; refundDue: number } | { ok: false; error: string }> {
  const user = await requirePermission('visit.cancel');
  if (typeof visitId !== 'string' || !visitId) return { ok: false, error: 'Invalid request' };
  try {
    const r = await receptionService.cancelBooking(visitId, reason?.trim().slice(0, 200) || undefined, user.id);
    return { ok: true, refundDue: r.refundDue };
  } catch (e) {
    return { ok: false, error: e instanceof BookingEditError ? e.message : 'The booking could not be cancelled.' };
  }
}

/** Balance a returning patient still owes from earlier visits. */
export async function patientDuesAction(patientId: string): Promise<{ total: number; invoices: { invoiceId: string; slipNo: string; bookedAt: string; due: number }[] }> {
  await requirePermission('visit.create');
  if (typeof patientId !== 'string' || !patientId) return { total: 0, invoices: [] };
  const r = await receptionService.outstandingFor(patientId);
  return { total: r.total, invoices: r.invoices.map((i) => ({ ...i, bookedAt: i.bookedAt.toISOString() })) };
}
