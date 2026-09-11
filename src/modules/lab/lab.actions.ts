'use server';

import { z } from 'zod';
import { requirePermission, currentUser, can } from '@/core/rbac/guard';
import { antibioticsService } from '@/modules/antibiotics/antibiotics.service';
import { LAB_BOARD_DAYS } from '@/modules/queue/queue.service';
import { labService } from './lab.service';
import { pickRange, ageInDays, type AgeUnit, type ReferenceRangeDef } from './calc-engine';
import { advanceSchema, saveResultsSchema } from './lab.schema';
import { canEnterResults, type OrderLineStatus } from './workflow';

// ── DTOs ────────────────────────────────────────────────
export interface WorkLineDTO {
  id: string;
  testName: string;
  status: string;
  dueAt: string | null;
  abnormal: number;
  /** Which tube this test needs. Drives the draw list on the workboard. */
  specimenType: string;
  /** Anything written against it yet. A collection can only be undone before. */
  hasResults: boolean;
  /** Instruction given at booking for this test. */
  bookingRemarks: string | null;
  /** Why it is running late, when someone has said. */
  delayReason: string | null;
  /** Reference lab the sample was sent to. */
  outsourcedTo: string | null;
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
  /** At least one tube collected, so there are labels to print. */
  hasSamples: boolean;
  /** Comments from the counter — instructions the bench should see. */
  notes: string | null;
  /** Today's waiting-room token, so the card the queue just called stands out. */
  token: { number: number; status: string } | null;
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
  const from = startOfDaysAgo(LAB_BOARD_DAYS);
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
    hasSamples: v.orderLines.some((l) => l.sampleId != null),
    notes: v.notes,
    // Numbers restart each morning, so an older day's token would clash with today's.
    token: v.token && v.token.at >= startOfDaysAgo(0)
      ? { number: v.token.number, status: v.token.status }
      : null,
    lines: v.orderLines.map((l) => ({
      id: l.id,
      testName: l.test.name,
      status: l.status,
      dueAt: l.dueAt ? l.dueAt.toISOString() : null,
      abnormal: l.results.filter((r) => r.flag === 'HIGH' || r.flag === 'LOW' || r.flag === 'CRITICAL').length,
      specimenType: l.test.specimenType,
      hasResults: l.results.length > 0,
      bookingRemarks: l.bookingRemarks,
      delayReason: l.delayReason,
      outsourcedTo: l.outsourcedTo?.name ?? null,
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

/** Ask for a fresh sample, with the reason. */
export async function requestRetakeAction(orderLineId: string, reason: string): Promise<ActionResult> {
  const user = await requirePermission('workflow.advance');
  const why = String(reason ?? '').trim().slice(0, 200);
  if (!why) return { ok: false, error: 'Say why a new sample is needed.' };
  try {
    await labService.requestRetake(orderLineId, user.id, why);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Action failed' };
  }
}

const cultureSchema = z.object({
  orderLineId: z.string().min(1),
  growth: z.boolean(),
  organism: z.string().max(120).optional(),
  colonyCount: z.string().max(60).optional(),
  incubation: z.string().max(120).optional(),
  remarks: z.string().max(500).optional(),
  sensitivities: z.array(z.object({
    antibiotic: z.string().trim().min(1).max(60),
    result: z.enum(['S', 'I', 'R']),
    mic: z.string().max(20).optional(),
  })).max(80).default([]),
});

/** Save a culture & sensitivity result. */
export async function saveCultureAction(input: unknown): Promise<ActionResult> {
  const user = await requirePermission('result.enter');
  const parsed = cultureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid culture result' };
  try {
    const { orderLineId, ...rest } = parsed.data;
    await labService.saveCulture(orderLineId, rest, user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Save failed' };
  }
}

/** Send a collected sample to a reference lab. */
export async function sendOutAction(orderLineId: string, partnerLabId: string, ref: string): Promise<ActionResult> {
  const user = await requirePermission('workflow.advance');
  try {
    await labService.sendOut(orderLineId, partnerLabId, String(ref ?? '').trim().slice(0, 60) || null, user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Action failed' };
  }
}

/** Record why a test is late. */
export async function markDelayedAction(orderLineId: string, reason: string): Promise<ActionResult> {
  const user = await requirePermission('workflow.advance');
  const why = String(reason ?? '').trim().slice(0, 200);
  if (!why) return { ok: false, error: 'Say why the test is delayed.' };
  try {
    await labService.markDelayed(orderLineId, user.id, why);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Action failed' };
  }
}

/** Put a test marked collected by mistake back on the draw list. */
export async function undoCollectAction(orderLineId: string): Promise<ActionResult> {
  const user = await requirePermission('workflow.advance');
  try {
    await labService.undoCollect(orderLineId, user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Action failed' };
  }
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
  sortOrder: number;
  referenceText: string;
  existingValue: string | null;
  existingFlag: string | null;
  /** Every range, so the screen can flag a value as it is typed. */
  ranges: ReferenceRangeDef[];
  formula: string | null;
  /** This patient's last released value for the same parameter, if any. */
  previous: { value: string; flag: string; at: string } | null;
  /** CUTOFF parameters: the cut-off and the words printed either side of it. */
  cutoff: number | null;
  positiveLabel: string | null;
  negativeLabel: string | null;
}
export interface EntryDTO {
  orderLineId: string;
  status: string;
  testName: string;
  patientName: string;
  mrNo: string;
  age: number | null;
  sex: string | null;
  /** Age in days for picking the right reference range; null when unknown. */
  ageDays: number | null;
  /** Comments from the counter for this visit. */
  notes: string | null;
  /** Remarks printed on the report under this test. */
  remarks: string;
  /** Instruction given at booking for this test. */
  bookingRemarks: string | null;
  visitId: string;
  /** STANDARD or CULTURE — decides which entry screen is shown. */
  reportFormat: string;
  culture: {
    growth: boolean; organism: string; colonyCount: string; incubation: string; remarks: string;
    sensitivities: { antibiotic: string; result: 'S' | 'I' | 'R'; mic: string }[];
  } | null;
  /** The lab's antibiotic panel, for a culture. */
  antibiotics: string[];
  /** Reference lab the sample went to, and its number there. */
  outsourcedTo: string | null;
  outsourceRef: string | null;
  /** Files attached to the booking (prescription, referral letter). */
  attachments: { id: string; fileName: string; mimeType: string; size: number }[];
  /** What to open after saving: this patient's next test, else the longest waiting. */
  next: { orderLineId: string; testName: string; patientName: string; samePatient: boolean } | null;
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
  const user = await requirePermission('result.enter');
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
  const previous = await labService.previousResults(
    line.visit.patientId, line.id, line.test.parameters.map((p) => p.id),
  );
  const nextLine = user.branchId
    ? await labService.nextForEntry(user.branchId, line.id, line.visitId)
    : null;
  return {
    orderLineId: line.id,
    status: line.status,
    notes: line.visit.notes,
    remarks: line.remarks ?? '',
    bookingRemarks: line.bookingRemarks,
    visitId: line.visitId,
    reportFormat: line.test.reportFormat,
    culture: line.culture
      ? {
          growth: line.culture.growth,
          organism: line.culture.organism ?? '',
          colonyCount: line.culture.colonyCount ?? '',
          incubation: line.culture.incubation ?? '',
          remarks: line.culture.remarks ?? '',
          sensitivities: line.culture.sensitivities.map((x) => ({ antibiotic: x.antibiotic, result: x.result as 'S' | 'I' | 'R', mic: x.mic ?? '' })),
        }
      : null,
    antibiotics: line.test.reportFormat === 'CULTURE' ? (await antibioticsService.list()).map((a) => a.name) : [],
    outsourcedTo: line.outsourcedTo?.name ?? null,
    outsourceRef: line.outsourceRef,
    attachments: await labService.attachmentsFor(line.visitId),
    next: nextLine
      ? {
          orderLineId: nextLine.id,
          testName: nextLine.test.name,
          patientName: nextLine.visit.patient.fullName,
          samePatient: nextLine.visitId === line.visitId,
        }
      : null,
    testName: line.test.name,
    patientName: line.visit.patient.fullName,
    mrNo: line.visit.patient.mrNo,
    age,
    sex,
    ageDays,
    canEdit: canEnterResults(line.status as OrderLineStatus),
    params: line.test.parameters.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit,
      valueType: p.valueType,
      options: p.options,
      isBold: p.isBold,
      sortOrder: p.sortOrder,
      referenceText: p.valueType === 'CUTOFF' && p.cutoff != null ? `Cut-off: ${Number(p.cutoff)}` : rangeText(p.referenceRanges, ageDays, sex),
      cutoff: p.cutoff != null ? Number(p.cutoff) : null,
      positiveLabel: p.positiveLabel,
      negativeLabel: p.negativeLabel,
      existingValue: existing.get(p.id) ?? null,
      existingFlag: existingFlags.get(p.id) ?? null,
      ranges: p.referenceRanges.map((r) => ({
        sex: r.sex as ReferenceRangeDef['sex'],
        ageMinDays: r.ageMinDays,
        ageMaxDays: r.ageMaxDays,
        low: r.low === null ? null : Number(r.low),
        high: r.high === null ? null : Number(r.high),
        criticalLow: r.criticalLow === null ? null : Number(r.criticalLow),
        criticalHigh: r.criticalHigh === null ? null : Number(r.criticalHigh),
        displayText: r.displayText,
      })),
      formula: p.formula?.expression ?? null,
      previous: previous.get(p.id) ?? null,
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
    const computed = await labService.saveResults(parsed.data.orderLineId, parsed.data.values, user.id, parsed.data.remarks);
    return { ok: true, computed: computed.map((c) => ({ code: c.code, value: c.value, flag: c.flag, isCalculated: c.isCalculated })) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Save failed' };
  }
}

// ── Approvals ───────────────────────────────────────────
export interface ApprovalValueDTO {
  name: string;
  value: string | null;
  unit: string | null;
  flag: string;
  reference: string | null;
  calculated: boolean;
  bold: boolean;
}

export interface ApprovalDTO {
  orderLineId: string;
  testName: string;
  patientName: string;
  mrNo: string;
  age: number | null;
  sex: string | null;
  slipNo: string;
  enteredBy: string | null;
  savedAt: string;
  abnormal: number;
  critical: number;
  /** Every parameter in order, blank ones included, so nothing is hidden. */
  values: ApprovalValueDTO[];
  /** Calculated parameters with no value. Approval is refused while any remain. */
  missingCalculated: string[];
  /** Entered by the person looking, where the lab forbids self-approval. */
  selfBlocked: boolean;
  /** A culture's result in one line, e.g. "E. coli · >10^5 CFU/mL · 12 antibiotics". */
  culture: string | null;
}

export async function getApprovalsAction(): Promise<ApprovalDTO[]> {
  const user = await requirePermission('result.approve');
  if (!user.branchId) return [];
  const [lines, allowSelfVerify] = await Promise.all([
    labService.getApprovals(user.branchId),
    labService.allowSelfVerify(),
  ]);
  return lines.map((l) => {
    const byParam = new Map(l.results.map((r) => [r.parameterId, r]));
    // The range that applies to this patient, not whichever row sorts first —
    // a woman's haemoglobin checked against the male range reads as low.
    const ageDays = ageInDays(l.visit.patient as {
      dateOfBirth: Date | null;
      age: number | null;
      ageUnit: AgeUnit | null;
    });
    const values: ApprovalValueDTO[] = l.test.parameters.map((p) => {
      const r = byParam.get(p.id);
      return {
        name: p.name,
        value: r?.value ?? null,
        unit: p.unit,
        flag: r?.flag ?? 'NORMAL',
        reference: rangeText(p.referenceRanges, ageDays, l.visit.patient.sex) || null,
        calculated: p.valueType === 'CALCULATED',
        bold: p.isBold,
      };
    });
    const latest = l.results.reduce<Date | null>(
      (acc, r) => (!acc || r.updatedAt > acc ? r.updatedAt : acc), null,
    );
    return {
      orderLineId: l.id,
      testName: l.test.name,
      patientName: l.visit.patient.fullName,
      mrNo: l.visit.patient.mrNo,
      age: l.visit.patient.age,
      sex: l.visit.patient.sex,
      slipNo: l.visit.slipNo,
      enteredBy: l.results[0]?.enteredBy?.fullName ?? null,
      savedAt: (latest ?? l.updatedAt).toISOString(),
      abnormal: l.results.filter((r) => r.flag === 'HIGH' || r.flag === 'LOW').length,
      critical: l.results.filter((r) => r.flag === 'CRITICAL').length,
      values,
      missingCalculated: values.filter((v) => v.calculated && (v.value == null || v.value.trim() === '')).map((v) => v.name),
      selfBlocked: !allowSelfVerify && l.results.some((r) => r.enteredById === user.id),
      culture: l.culture
        ? (l.culture.growth
          ? [l.culture.organism, l.culture.colonyCount, l.culture._count.sensitivities ? `${l.culture._count.sensitivities} antibiotics` : null].filter(Boolean).join(' · ')
          : 'No growth')
        : null,
    };
  });
}

/**
 * Release several results at once — the ones an approver has looked at and
 * found entirely normal. Each is approved on its own, through the same checks
 * as a single approval, so one refusal does not undo or block the rest.
 */
export async function approveManyAction(
  orderLineIds: string[],
): Promise<{ approved: number; failed: { orderLineId: string; error: string }[] }> {
  const user = await requirePermission('result.approve');
  let approved = 0;
  const failed: { orderLineId: string; error: string }[] = [];
  for (const id of orderLineIds.slice(0, 60)) {
    try {
      await labService.approve(id, { id: user.id, role: user.role });
      approved++;
    } catch (e) {
      failed.push({ orderLineId: id, error: e instanceof Error ? e.message : 'Approval failed' });
    }
  }
  return { approved, failed };
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

async function mayRelease() {
  return (await can('report.print')) || (await can('report.deliver'));
}

/** The report was printed at the counter. */
export async function markReportPrintedAction(visitId: string): Promise<ActionResult> {
  const user = await currentUser();
  if (!(await mayRelease())) return { ok: false, error: 'You cannot release reports.' };
  try {
    await labService.releaseVisit(visitId, 'PRINTED', user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

/** The report reached the patient: handed over, or sent on WhatsApp. */
export async function markReportDeliveredAction(
  visitId: string,
  channel: 'PRINT' | 'WHATSAPP',
): Promise<ActionResult & { delivered?: number }> {
  const user = await currentUser();
  if (!(await mayRelease())) return { ok: false, error: 'You cannot release reports.' };
  if (channel !== 'PRINT' && channel !== 'WHATSAPP') return { ok: false, error: 'Invalid request' };
  try {
    const delivered = await labService.releaseVisit(visitId, 'DELIVERED', user.id, channel);
    if (delivered === 0) return { ok: false, error: 'Nothing to hand over.' };
    return { ok: true, delivered };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export interface ReadyReportDTO {
  visitId: string;
  slipNo: string;
  patientName: string;
  mrNo: string;
  mobile: string | null;
  tests: string[];
  printed: boolean;
  bookedAt: string;
}

export async function getReadyReportsAction(): Promise<ReadyReportDTO[]> {
  const user = await currentUser();
  if (!user.branchId || !(await mayRelease())) return [];
  const visits = await labService.readyToHandOver(user.branchId);
  return visits.map((v) => ({
    visitId: v.id,
    slipNo: v.slipNo,
    patientName: v.patient.fullName,
    mrNo: v.patient.mrNo,
    mobile: v.patient.mobile,
    tests: v.orderLines.filter((l) => l.status !== 'CANCELLED').map((l) => l.test.name),
    printed: v.orderLines.some((l) => l.status === 'PRINTED'),
    bookedAt: v.bookedAt.toISOString(),
  }));
}
