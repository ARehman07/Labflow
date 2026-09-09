'use server';

import { requirePermission, currentUser, can } from '@/core/rbac/guard';
import { labService } from './lab.service';
import { pickRange, ageInDays, type AgeUnit } from './calc-engine';
import { advanceSchema, saveResultsSchema } from './lab.schema';

// ── DTOs ────────────────────────────────────────────────
export interface WorkLineDTO {
  id: string;
  testName: string;
  status: string;
  dueAt: string | null;
  abnormal: number;
  /** Which tube this test needs. Drives the draw list on the workboard. */
  specimenType: string;
}
export interface WorkVisitDTO {
  id: string;
  slipNo: string;
  patientName: string;
  mrNo: string;
  age: number | null;
  sex: string | null;
  bookedAt: string;
  lines: WorkLineDTO[];
}

function startOfDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getWorkboardAction(query?: string): Promise<WorkVisitDTO[]> {
  const user = await currentUser();
  if (!user.branchId) return [];
  const from = startOfDaysAgo(30);
  const to = new Date();
  const visits = await labService.getWorkboard(user.branchId, from, to, query);
  return visits.map((v) => ({
    id: v.id,
    slipNo: v.slipNo,
    patientName: v.patient.fullName,
    mrNo: v.patient.mrNo,
    age: v.patient.age,
    sex: v.patient.sex,
    bookedAt: v.bookedAt.toISOString(),
    lines: v.orderLines.map((l) => ({
      id: l.id,
      testName: l.test.name,
      status: l.status,
      dueAt: l.dueAt ? l.dueAt.toISOString() : null,
      abnormal: l.results.filter((r) => r.flag === 'HIGH' || r.flag === 'LOW' || r.flag === 'CRITICAL').length,
      specimenType: l.test.specimenType,
    })),
  }));
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Advance several order lines at once.
 *
 * Exists for one physical reason: a phlebotomist draws every tube a patient
 * needs in a single visit. Marking tests collected one at a time invites a
 * half-collected slip when someone is interrupted mid-list.
 */
export async function advanceManyAction(
  orderLineIds: string[],
  to: string,
): Promise<ActionResult & { advanced?: number }> {
  const user = await requirePermission('workflow.advance');
  let advanced = 0;
  const failures: string[] = [];
  for (const id of orderLineIds) {
    const parsed = advanceSchema.safeParse({ orderLineId: id, to });
    if (!parsed.success) { failures.push(id); continue; }
    try {
      await labService.transition(parsed.data.orderLineId, parsed.data.to, user.id);
      advanced += 1;
    } catch {
      failures.push(id);
    }
  }
  if (advanced === 0) return { ok: false, error: 'Nothing could be advanced.' };
  return { ok: true, advanced };
}

export async function advanceAction(input: unknown): Promise<ActionResult> {
  const user = await requirePermission('workflow.advance');
  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid request' };
  try {
    await labService.transition(parsed.data.orderLineId, parsed.data.to, user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Action failed' };
  }
}

// ── Result entry ────────────────────────────────────────
export interface EntryParamDTO {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  valueType: string;
  options: string | null;
  isBold: boolean;
  referenceText: string;
  existingValue: string | null;
  existingFlag: string | null;
}
export interface EntryDTO {
  orderLineId: string;
  status: string;
  testName: string;
  patientName: string;
  mrNo: string;
  age: number | null;
  sex: string | null;
  canEdit: boolean;
  params: EntryParamDTO[];
}

function rangeText(
  ranges: {
    sex: string;
    ageMinDays: number;
    ageMaxDays: number;
    low: unknown;
    high: unknown;
    criticalLow?: unknown;
    criticalHigh?: unknown;
    displayText: string | null;
  }[],
  ageDays: number | null,
  sex: string | null,
): string {
  const picked = pickRange(
    ranges.map((r) => ({
      sex: r.sex as 'ANY' | 'MALE' | 'FEMALE',
      ageMinDays: r.ageMinDays,
      ageMaxDays: r.ageMaxDays,
      low: r.low === null ? null : Number(r.low),
      high: r.high === null ? null : Number(r.high),
      criticalLow: r.criticalLow == null ? null : Number(r.criticalLow),
      criticalHigh: r.criticalHigh == null ? null : Number(r.criticalHigh),
      displayText: r.displayText,
    })),
    { ageDays, sex: (sex as 'MALE' | 'FEMALE' | 'OTHER' | null) ?? null },
  );
  if (!picked) return '';
  if (picked.displayText) return picked.displayText;
  if (picked.low !== null && picked.high !== null) return `${picked.low} – ${picked.high}`;
  if (picked.high !== null) return `< ${picked.high}`;
  if (picked.low !== null) return `> ${picked.low}`;
  return '';
}

export async function getEntryAction(orderLineId: string): Promise<EntryDTO | null> {
  await requirePermission('result.enter');
  const line = await labService.getEntry(orderLineId);
  if (!line) return null;
  const existing = new Map(line.results.map((r) => [r.parameterId, r.value]));
  const existingFlags = new Map(line.results.map((r) => [r.parameterId, r.flag]));
  const { age, sex } = line.visit.patient;
  const ageDays = ageInDays(line.visit.patient as {
    dateOfBirth: Date | null;
    age: number | null;
    ageUnit: AgeUnit | null;
  });
  return {
    orderLineId: line.id,
    status: line.status,
    testName: line.test.name,
    patientName: line.visit.patient.fullName,
    mrNo: line.visit.patient.mrNo,
    age,
    sex,
    canEdit: line.status === 'IN_PROGRESS' || line.status === 'RESULT_SAVED',
    params: line.test.parameters.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit,
      valueType: p.valueType,
      options: p.options,
      isBold: p.isBold,
      referenceText: rangeText(p.referenceRanges, ageDays, sex),
      existingValue: existing.get(p.id) ?? null,
      existingFlag: existingFlags.get(p.id) ?? null,
    })),
  };
}

export interface SaveResultsResult {
  ok: boolean;
  error?: string;
  computed?: { code: string; value: string | null; flag: string; isCalculated: boolean }[];
}

export async function saveResultsAction(input: unknown): Promise<SaveResultsResult> {
  const user = await requirePermission('result.enter');
  const parsed = saveResultsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid result values' };
  try {
    const computed = await labService.saveResults(parsed.data.orderLineId, parsed.data.values, user.id);
    return { ok: true, computed: computed.map((c) => ({ code: c.code, value: c.value, flag: c.flag, isCalculated: c.isCalculated })) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Save failed' };
  }
}

// ── Approvals ───────────────────────────────────────────
export interface ApprovalDTO {
  orderLineId: string;
  testName: string;
  patientName: string;
  mrNo: string;
  enteredBy: string | null;
  abnormal: number;
}

export async function getApprovalsAction(): Promise<ApprovalDTO[]> {
  const user = await requirePermission('result.approve');
  if (!user.branchId) return [];
  const lines = await labService.getApprovals(user.branchId);
  return lines.map((l) => ({
    orderLineId: l.id,
    testName: l.test.name,
    patientName: l.visit.patient.fullName,
    mrNo: l.visit.patient.mrNo,
    enteredBy: l.results[0]?.enteredBy?.fullName ?? null,
    abnormal: l.results.filter((r) => r.flag === 'HIGH' || r.flag === 'LOW' || r.flag === 'CRITICAL').length,
  }));
}

export async function approveAction(orderLineId: string): Promise<ActionResult> {
  const user = await requirePermission('result.approve');
  try {
    await labService.approve(orderLineId, { id: user.id, role: user.role });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Approval failed' };
  }
}

export async function sendBackAction(orderLineId: string): Promise<ActionResult> {
  const user = await requirePermission('result.approve');
  try {
    await labService.sendBack(orderLineId, user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// ─────────────────────────────────────────────────────────────
// Critical results — the callback loop
//
// A flag on a report is not communication. These actions drive the worklist
// that stays in someone's face until a clinician has actually been told.
// ─────────────────────────────────────────────────────────────

export interface CriticalCallbackDTO {
  id: string;
  patientName: string;
  mrNo: string;
  patientMobile: string | null;
  testName: string;
  parameterName: string;
  value: string | null;
  unit: string | null;
  openedAt: string;
}

export async function getCriticalCallbacksAction(): Promise<CriticalCallbackDTO[]> {
  await requirePermission('critical.manage');
  const rows = await labService.pendingCriticalCallbacks();
  return rows.map((r) => ({
    id: r.id,
    patientName: r.resultValue.orderLine.visit.patient.fullName,
    mrNo: r.resultValue.orderLine.visit.patient.mrNo,
    patientMobile: r.resultValue.orderLine.visit.patient.mobile,
    testName: r.resultValue.orderLine.test.name,
    parameterName: r.resultValue.parameter.name,
    value: r.resultValue.value,
    unit: r.resultValue.parameter.unit,
    openedAt: r.createdAt.toISOString(),
  }));
}

export async function recordCriticalCallbackAction(
  id: string,
  details: {
    notifiedTo: string;
    notifiedPhone?: string;
    method: string;
    acknowledgedBy?: string;
    notes?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission('critical.manage');
  if (!details.notifiedTo.trim()) {
    return { ok: false, error: 'Record who was actually contacted.' };
  }
  try {
    await labService.recordCriticalCallback(id, user.id, details);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to record the callback.' };
  }
}

/**
 * One conversation, many flagged values. A clinician rung about a patient is
 * told every critical result that patient has, so logging them one at a time
 * both wastes the operator's time and records a call history that never
 * happened. Each value still gets its own audited callback row — the details
 * are simply shared.
 */
export async function recordCriticalCallbacksAction(
  ids: string[],
  details: {
    notifiedTo: string;
    notifiedPhone?: string;
    method: string;
    acknowledgedBy?: string;
    notes?: string;
  },
): Promise<{ ok: true; recorded: number } | { ok: false; error: string }> {
  const user = await requirePermission('critical.manage');
  if (!details.notifiedTo.trim()) {
    return { ok: false, error: 'Record who was actually contacted.' };
  }
  if (ids.length === 0) return { ok: false, error: 'Nothing to record.' };
  try {
    for (const id of ids) {
      await labService.recordCriticalCallback(id, user.id, details);
    }
    return { ok: true, recorded: ids.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to record the callback.' };
  }
}

// ─────────────────────────────────────────────────────────────
// Notifiable diseases — the statutory reporting obligation
// ─────────────────────────────────────────────────────────────

export interface NotifiableDTO {
  id: string;
  conditionName: string;
  patientName: string;
  mrNo: string;
  testName: string;
  parameterName: string;
  value: string | null;
  flaggedAt: string;
}

export async function getNotifiableReportsAction(): Promise<NotifiableDTO[]> {
  await requirePermission('notifiable.manage');
  const rows = await labService.pendingNotifiableReports();
  return rows.map((r) => ({
    id: r.id,
    conditionName: r.condition.name,
    patientName: r.resultValue.orderLine.visit.patient.fullName,
    mrNo: r.resultValue.orderLine.visit.patient.mrNo,
    testName: r.resultValue.orderLine.test.name,
    parameterName: r.resultValue.parameter.name,
    value: r.resultValue.value,
    flaggedAt: r.flaggedAt.toISOString(),
  }));
}

export async function recordNotifiableFilingAction(
  id: string,
  details: { reportedTo: string; referenceNo?: string; notes?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission('notifiable.manage');
  if (!details.reportedTo.trim()) {
    return { ok: false, error: 'Record which authority it was reported to.' };
  }
  try {
    await labService.recordNotifiableFiling(id, details);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to record the filing.' };
  }
}

/** Counts for the sidebar / dashboard badges. */
export async function getSafetyQueueCountsAction(): Promise<{
  criticalOpen: number;
  notifiableOpen: number;
}> {
  const [critical, notifiable] = await Promise.all([
    can('critical.manage').then((ok) => (ok ? labService.pendingCriticalCallbacks() : [])),
    can('notifiable.manage').then((ok) => (ok ? labService.pendingNotifiableReports() : [])),
  ]);
  return { criticalOpen: critical.length, notifiableOpen: notifiable.length };
}
