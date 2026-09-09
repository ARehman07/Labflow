'use server';

import { requirePermission } from '@/core/rbac/guard';
import { listTests, type TestListItem } from '@/modules/catalog/catalog.service';
import { receptionService } from './reception.service';
import { patientCreateSchema, bookVisitSchema } from './reception.schema';

export interface PatientDTO {
  id: string;
  mrNo: string;
  fullName: string;
  age: number | null;
  sex: string | null;
  mobile: string | null;
}

const toPatientDTO = (p: {
  id: string;
  mrNo: string;
  fullName: string;
  age: number | null;
  sex: string | null;
  mobile: string | null;
}): PatientDTO => ({
  id: p.id,
  mrNo: p.mrNo,
  fullName: p.fullName,
  age: p.age,
  sex: p.sex,
  mobile: p.mobile,
});

export async function searchPatientsAction(query: string): Promise<PatientDTO[]> {
  await requirePermission('visit.create');
  const patients = await receptionService.searchPatients(query);
  return patients.map(toPatientDTO);
}

export async function searchTestsAction(query: string): Promise<TestListItem[]> {
  const user = await requirePermission('visit.create');
  return listTests(user.branchId, query || undefined);
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
  } catch {
    return { ok: false, error: 'Booking failed. Please check the selected tests and try again.' };
  }
}
