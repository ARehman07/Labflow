'use server';

import { featureOn } from '@/core/features/features.server';import Anthropic from '@anthropic-ai/sdk';
import { can, currentUser } from '@/core/rbac/guard';
import { tenantDb } from '@/core/db/context';
import { getReportData } from '@/modules/reporting/reporting.service';
import { labService } from '@/modules/lab/lab.service';
import { ageInDays, type AgeUnit } from '@/modules/lab/calc-engine';
import { aiConfigured, draftInterpretation, AiNotConfiguredError } from './ai.service';

type Res = { ok: true; text: string } | { ok: false; error: string };

async function mayUse() {
  return ((await can('result.enter')) || (await can('result.approve'))) && (await featureOn('lab.ai'));
}

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof AiNotConfiguredError) return { ok: false, error: e.message };
  if (e instanceof Anthropic.RateLimitError) return { ok: false, error: 'The AI service is busy. Try again in a minute.' };
  if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: 'The AI key was refused. Check ANTHROPIC_API_KEY.' };
  if (e instanceof Anthropic.APIError) return { ok: false, error: `The AI service returned an error (${e.status}).` };
  return { ok: false, error: e instanceof Error ? e.message : 'The AI comment could not be drafted.' };
}

export async function aiStatusAction(): Promise<{ configured: boolean }> {
  await currentUser();
  return { configured: aiConfigured() && (await featureOn('lab.ai')) };
}

/** Draft a comment on one test's entered results, with the patient's last released values. */
export async function aiInterpretTestAction(orderLineId: string): Promise<Res> {
  if (!(await mayUse())) return { ok: false, error: 'You cannot use AI analysis.' };
  try {
    const line = await labService.getEntry(orderLineId);
    if (!line) return { ok: false, error: 'Test not found.' };
    const p = line.visit.patient;
    const days = ageInDays(p as { dateOfBirth: Date | null; age: number | null; ageUnit: AgeUnit | null });
    const previous = await labService.previousResults(line.visit.patientId, line.visitId, line.test.parameters);
    const byParam = new Map(line.results.map((r) => [r.parameterId, r]));
    const rows = line.test.parameters.map((prm) => {
      const r = byParam.get(prm.id);
      const range = prm.referenceRanges[0];
      const ref = range?.displayText ?? (range ? `${range.low ?? ''}–${range.high ?? ''}` : '');
      const prev = previous.get(prm.id);
      return `${prm.name}: ${r?.value ?? '(blank)'} ${prm.unit ?? ''} [ref ${ref || 'n/a'}] flag ${r?.flag ?? 'NORMAL'}${prev ? `; earlier ${prev.value} on ${prev.at.slice(0, 10)}` : ''}`;
    });
    const text = [
      `Patient: ${p.sex ?? 'sex unknown'}, age ${p.age ?? '?'} ${(p.ageUnit ?? 'YEARS').toLowerCase()}${days != null ? ` (${days} days)` : ''}.`,
      `Test: ${line.test.name}`,
      ...rows,
    ].join('\n');
    return { ok: true, text: await draftInterpretation(text) };
  } catch (e) {
    return fail(e);
  }
}

/** Draft a comment on a whole released report, including earlier results. */
export async function aiInterpretReportAction(visitId: string): Promise<Res> {
  if (!(await mayUse()) && !(await can('report.print'))) return { ok: false, error: 'You cannot use AI analysis.' };
  try {
    const data = await getReportData(visitId);
    if (!data) return { ok: false, error: 'No released results on this report.' };
    const visit = await (await tenantDb()).visit.findUnique({ where: { id: visitId }, select: { patient: { select: { sex: true, age: true, ageUnit: true } } } });
    const lines = data.tests.flatMap((t) => [
      `Test: ${t.name}`,
      ...t.params.filter((x) => x.value != null && String(x.value).trim() !== '').map((x) =>
        `  ${x.name}: ${x.value} ${x.unit ?? ''} [ref ${x.reference || 'n/a'}] flag ${x.flag}${x.interpretation ? ` (${x.interpretation})` : ''}${x.previous.some(Boolean) ? `; earlier: ${t.history.map((h, i) => (x.previous[i] ? `${x.previous[i]} on ${h.date}` : null)).filter(Boolean).join(', ')}` : ''}`),
      ...(t.culture ? [`  Culture: ${t.culture.growth ? `${t.culture.organism} ${t.culture.colonyCount ?? ''}; ${t.culture.sensitivities.map((s) => `${s.antibiotic} ${s.result}`).join(', ')}` : 'no growth'}`] : []),
    ]);
    const text = [
      `Patient: ${visit?.patient.sex ?? 'sex unknown'}, age ${visit?.patient.age ?? '?'} ${(visit?.patient.ageUnit ?? 'YEARS').toLowerCase()}.`,
      ...lines,
    ].join('\n');
    return { ok: true, text: await draftInterpretation(text) };
  } catch (e) {
    return fail(e);
  }
}
