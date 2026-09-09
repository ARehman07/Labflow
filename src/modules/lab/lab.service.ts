import { tenantDb, currentTenantId } from '@/core/db/context';
import { openCriticalNotifications } from './critical';
import type { TenantTransactionClient } from '@/core/db/tenant';
import { labRepository } from './lab.repository';
import {
  assertTransition,
  canEnterResults,
  type OrderLineStatus,
} from './workflow';
import {
  computeResultSet,
  ageInDays,
  type ParameterDef,
  type ComputedResult,
  type AgeUnit,
} from './calc-engine';

async function logEvent(
  tx: TenantTransactionClient,
  orderLineId: string,
  from: OrderLineStatus | null,
  to: OrderLineStatus,
  actorId: string,
  note?: string,
) {
  await tx.workflowEvent.create({
    data: { tenantId: await currentTenantId(), orderLineId, fromState: from, toState: to, actorId, note: note ?? null },
  });
}

export const labService = {
  getWorkboard: async (branchId: string, from: Date, to: Date, query?: string) =>
    labRepository.workboard(branchId, from, to, query),

  getEntry: async (orderLineId: string) => labRepository.orderLineForEntry(orderLineId),

  getApprovals: async (branchId: string) => labRepository.approvalsQueue(branchId),

  /** Advance an order line one step (collect, start, print, etc.). */
  async transition(orderLineId: string, to: OrderLineStatus, actorId: string) {
    const line = await (await tenantDb()).orderLine.findUnique({ where: { id: orderLineId } });
    if (!line) throw new Error('Order line not found');
    const from = line.status as OrderLineStatus;
    assertTransition(from, to);
    await (await tenantDb()).$transaction(async (tx) => {
      await tx.orderLine.update({ where: { id: orderLineId }, data: { status: to } });
      await logEvent(tx, orderLineId, from, to, actorId);
    });
  },

  /**
   * Save entered result values. Calculated parameters are computed server-side
   * via the calc engine; every numeric value is flagged against the age/sex
   * reference range. Moves IN_PROGRESS → RESULT_SAVED (idempotent when editing).
   */
  async saveResults(
    orderLineId: string,
    rawByCode: Record<string, string>,
    enteredById: string,
  ): Promise<ComputedResult[]> {
    const line = await labRepository.orderLineForEntry(orderLineId);
    if (!line) throw new Error('Order line not found');
    if (!canEnterResults(line.status as OrderLineStatus)) {
      throw new Error('Results cannot be entered at this stage.');
    }

    const params: ParameterDef[] = line.test.parameters.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit,
      valueType: p.valueType as ParameterDef['valueType'],
      sortOrder: p.sortOrder,
      referenceRanges: p.referenceRanges.map((r) => ({
        sex: r.sex as 'ANY' | 'MALE' | 'FEMALE',
        ageMinDays: r.ageMinDays,
        ageMaxDays: r.ageMaxDays,
        low: r.low === null ? null : Number(r.low),
        high: r.high === null ? null : Number(r.high),
        criticalLow: r.criticalLow === null ? null : Number(r.criticalLow),
        criticalHigh: r.criticalHigh === null ? null : Number(r.criticalHigh),
        displayText: r.displayText,
      })),
      formula: p.formula ? { expression: p.formula.expression, inputs: [] } : null,
    }));

    const tenantId = await currentTenantId();
    const computed = computeResultSet(params, rawByCode, {
      ageDays: ageInDays(line.visit.patient as {
        dateOfBirth: Date | null;
        age: number | null;
        ageUnit: AgeUnit | null;
      }),
      sex: line.visit.patient.sex as 'MALE' | 'FEMALE' | 'OTHER' | null,
    });

    const from = line.status as OrderLineStatus;
    await (await tenantDb()).$transaction(async (tx) => {
      for (const c of computed) {
        await tx.resultValue.upsert({
          where: { orderLineId_parameterId: { orderLineId, parameterId: c.parameterId } },
          create: { tenantId: await currentTenantId(),
            orderLineId,
            parameterId: c.parameterId,
            value: c.value,
            numericValue: c.numericValue,
            flag: c.flag,
            isCalculated: c.isCalculated,
            enteredById,
          },
          update: {
            value: c.value,
            numericValue: c.numericValue,
            flag: c.flag,
            isCalculated: c.isCalculated,
            enteredById,
          },
        });
      }
      if (from === 'IN_PROGRESS') {
        assertTransition(from, 'RESULT_SAVED');
        await tx.orderLine.update({ where: { id: orderLineId }, data: { status: 'RESULT_SAVED' } });
        await logEvent(tx, orderLineId, from, 'RESULT_SAVED', enteredById, 'Results entered');
      }

      // A critical value opens a callback the moment it is saved — before
      // approval, because the clinician needs to know now, not after sign-off.
      await openCriticalNotifications(tx, tenantId, orderLineId);
    });

    return computed;
  },

  /**
   * Approve a saved result.
   *
   * Separation of duties: the user who saved a result may not release it. This
   * used to carry an escape hatch for the Admin role, which meant the one
   * account most likely to do everything alone could sign off its own work.
   * The exception is now a per-lab setting (`Tenant.allowSelfVerify`), off by
   * default, so bypassing it is a deliberate act by the superadmin rather than
   * a side effect of holding a role.
   */
  async approve(orderLineId: string, approver: { id: string; role: string }) {
    const line = await (await tenantDb()).orderLine.findUnique({
      where: { id: orderLineId },
      include: { results: true },
    });
    if (!line) throw new Error('Order line not found');
    const from = line.status as OrderLineStatus;
    assertTransition(from, 'APPROVED');

    const enteredByThisUser = line.results.some((r) => r.enteredById === approver.id);
    if (enteredByThisUser) {
      const tenant = await (await tenantDb()).tenant.findUniqueOrThrow({
        where: { id: await currentTenantId() },
        select: { allowSelfVerify: true },
      });
      if (!tenant.allowSelfVerify) {
        throw new Error('Separation of duties: you cannot approve results you entered.');
      }
    }

    await (await tenantDb()).$transaction(async (tx) => {
      await tx.orderLine.update({ where: { id: orderLineId }, data: { status: 'APPROVED' } });
      await tx.resultValue.updateMany({
        where: { orderLineId },
        data: { approvedById: approver.id, approvedAt: new Date() },
      });
      await logEvent(tx, orderLineId, from, 'APPROVED', approver.id, 'Approved');
    });
  },

  /** @see ./critical — kept session-free so it can be unit tested. */
  openCriticalNotifications,

  /** Critical results still awaiting a callback. Drives the worklist. */
  async pendingCriticalCallbacks() {
    return (await tenantDb()).criticalNotification.findMany({
      where: { notifiedAt: null },
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
      orderBy: { createdAt: 'asc' },
    });
  },

  /** Flag a result as a notifiable condition. Opens a reporting obligation. */
  async flagNotifiable(resultValueId: string, conditionId: string, byUserId: string) {
    const tenantId = await currentTenantId();
    return (await tenantDb()).notifiableReport.upsert({
      where: { resultValueId_conditionId: { resultValueId, conditionId } },
      update: {},
      create: { tenantId, resultValueId, conditionId, flaggedById: byUserId },
    });
  },

  /** Notifiable findings not yet filed with the authority. Drives the worklist. */
  async pendingNotifiableReports() {
    return (await tenantDb()).notifiableReport.findMany({
      where: { reportedAt: null },
      include: {
        condition: true,
        resultValue: {
          include: {
            parameter: { select: { name: true } },
            orderLine: {
              include: {
                test: { select: { name: true } },
                visit: { include: { patient: { select: { fullName: true, mrNo: true, mobile: true } } } },
              },
            },
          },
        },
      },
      orderBy: { flaggedAt: 'asc' },
    });
  },

  /** Record that a notifiable finding was filed. */
  async recordNotifiableFiling(
    id: string,
    details: { reportedTo: string; referenceNo?: string; notes?: string },
  ) {
    return (await tenantDb()).notifiableReport.update({
      where: { id },
      data: {
        reportedAt: new Date(),
        reportedTo: details.reportedTo,
        referenceNo: details.referenceNo ?? null,
        notes: details.notes ?? null,
      },
    });
  },

  /** Record that a clinician was actually reached. Closes the callback. */
  async recordCriticalCallback(
    id: string,
    by: string,
    details: { notifiedTo: string; notifiedPhone?: string; method: string; acknowledgedBy?: string; notes?: string },
  ) {
    return (await tenantDb()).criticalNotification.update({
      where: { id },
      data: {
        notifiedById: by,
        notifiedTo: details.notifiedTo,
        notifiedPhone: details.notifiedPhone ?? null,
        method: details.method,
        notifiedAt: new Date(),
        acknowledgedBy: details.acknowledgedBy ?? null,
        acknowledgedAt: details.acknowledgedBy ? new Date() : null,
        notes: details.notes ?? null,
      },
    });
  },

  /** Send a saved result back to the technician for correction. */
  async sendBack(orderLineId: string, actorId: string) {
    await this.transition(orderLineId, 'IN_PROGRESS', actorId);
  },
};
