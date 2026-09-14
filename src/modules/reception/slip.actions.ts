'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/core/rbac/guard';
import { slipPatientSchema } from './reception.schema';
import { receptionService } from './reception.service';
import { labService } from '@/modules/lab/lab.service';

type Result = { ok: true; count?: number } | { ok: false; error: string };

/** Modify slip: correct the patient's details. */
export async function updateSlipPatientAction(visitId: string, input: unknown): Promise<Result> {
  const user = await requirePermission('visit.modify');
  const parsed = slipPatientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid details' };
  try {
    await receptionService.updateSlipPatient(visitId, parsed.data, user.id);
    revalidatePath(`/reception/${visitId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Save failed' };
  }
}

/** Modify slip: take released results back for correction. */
export async function reopenResultsAction(visitId: string, reason: string): Promise<Result> {
  const user = await requirePermission('result.approve');
  const why = String(reason ?? '').trim();
  if (why.length < 3) return { ok: false, error: 'Say why the results need to change.' };
  try {
    const count = await labService.reopenResults(visitId, user.id, why.slice(0, 200));
    revalidatePath(`/reception/${visitId}`);
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not mark pending' };
  }
}
