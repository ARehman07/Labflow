import { randomBytes } from 'crypto';
import { tenantDb, currentTenantId } from '@/core/db/context';
import { openCriticalNotifications } from './critical';
import type { TenantTransactionClient } from '@/core/db/tenant';
import { labRepository } from './lab.repository';
import { LAB_BOARD_DAYS } from '@/modules/queue/queue.service';
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

/** Short specimen codes for barcodes: short enough for a tube label, still readable. */
const SPECIMEN_CODE: Record<string, string> = {
  BLOOD: 'BLD', SERUM: 'SER', PLASMA: 'PLS', URINE: 'URN', STOOL: 'STL', SWAB: 'SWB', OTHER: 'OTH',
};

/** Stages a test can still be in before its report is out of the lab's hands. */
const NOT_FINISHED = ['BOOKED', 'SAMPLE_COLLECTED', 'SAMPLE_DISPATCHED', 'SAMPLE_RECEIVED', 'IN_PROGRESS', 'RESULT_SAVED', 'RETAKE', 'APPROVED', 'PRINTED'] as const;
/** Stages where work is still going on, so the report is not ready to hand over. */
const PENDING = ['BOOKED', 'SAMPLE_COLLECTED', 'SAMPLE_DISPATCHED', 'SAMPLE_RECEIVED', 'IN_PROGRESS', 'RESULT_SAVED', 'RETAKE'] as const;

/**
 * Close a visit once every test on it is delivered or cancelled.
 *
 * Nothing ever marked a visit finished, so "Ready" only ever grew and a patient
 * whose report was handed over months ago still looked open.
 */
async function completeVisitIfDone(visitId: string) {
  const db = await tenantDb();
  const open = await db.orderLine.count({ where: { visitId, status: { in: [...NOT_FINISHED] } } });
  if (open === 0) {
    await db.visit.updateMany({ where: { id: visitId, status: 'OPEN' }, data: { status: 'COMPLETED' } });
  }
}

export const labService = {
  getWorkboard: async (branchId: string, from: Date, to: Date, query?: string) =>
    labRepository.workboard(branchId, from, to, query),

  getEntry: async (orderLineId: string) => labRepository.orderLineForEntry(orderLineId),

  /** Attachment details for a visit, without the file contents. */
  async attachmentsFor(visitId: string) {
    return (await tenantDb()).attachment.findMany({
      where: { visitId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fileName: true, mimeType: true, size: true },
    });
  },

  /**
   * The test to open after this one at the bench: the same patient's next
   * test first, because the tubes are already on the rack, then whoever has
   * been waiting longest. Only tests whose sample is in hand — anything still
   * to draw is not something a technician can key in.
   */
  async nextForEntry(branchId: string, currentId: string, visitId: string) {
    const db = await tenantDb();
    const from = new Date();
    from.setDate(from.getDate() - LAB_BOARD_DAYS);
    from.setHours(0, 0, 0, 0);
    const where = {
      id: { not: currentId },
      status: { in: ['SAMPLE_COLLECTED', 'SAMPLE_RECEIVED', 'IN_PROGRESS'] as OrderLineStatus[] },
      visit: { branchId, bookedAt: { gte: from } },
    };
    const select = {
      id: true,
      visitId: true,
      test: { select: { name: true } },
      visit: { select: { patient: { select: { fullName: true } } } },
    } as const;
    return (
      await db.orderLine.findFirst({ where: { ...where, visitId }, orderBy: { createdAt: 'asc' }, select })
    ) ?? db.orderLine.findFirst({
      where,
      orderBy: [{ visit: { bookedAt: 'asc' } }, { createdAt: 'asc' }],
      select,
    });
  },

  /**
   * Put a test marked collected by mistake back on the draw list.
   *
   * Only before anything is written against it: once a result exists the tube
   * has been used, and pretending it was never drawn would orphan that result.
   * The tube record goes too when no other test shares it, so its barcode is
   * not left pointing at nothing, and today's queue token re-opens so the
   * patient can be called in again.
   */
  async undoCollect(orderLineId: string, actorId: string) {
    const db = await tenantDb();
    const line = await db.orderLine.findUnique({
      where: { id: orderLineId },
      select: { status: true, visitId: true, sampleId: true },
    });
    if (!line) throw new Error('Order line not found');
    if (line.status !== 'SAMPLE_COLLECTED') {
      throw new Error('Only a sample that was just collected can be undone.');
    }
    const results = await db.resultValue.count({ where: { orderLineId } });
    if (results > 0) {
      throw new Error('Results have been entered for this test, so its collection cannot be undone.');
    }
    assertTransition('SAMPLE_COLLECTED', 'BOOKED');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await db.$transaction(async (tx) => {
      await tx.orderLine.update({ where: { id: orderLineId }, data: { status: 'BOOKED', sampleId: null } });
      await logEvent(tx, orderLineId, 'SAMPLE_COLLECTED', 'BOOKED', actorId, 'Collection undone');
      if (line.sampleId) {
        const sharing = await tx.orderLine.count({ where: { sampleId: line.sampleId } });
        if (sharing === 0) await tx.sample.deleteMany({ where: { id: line.sampleId } });
      }
      await tx.queueToken.updateMany({
        where: { visitId: line.visitId, status: 'DONE', at: { gte: today } },
        data: { status: 'WAITING' },
      });
    });
  },

  /** Everything a tube label needs for one visit. */
  async getLabels(visitId: string) {
    return (await tenantDb()).visit.findUnique({
      where: { id: visitId },
      select: {
        slipNo: true,
        bookedAt: true,
        patient: { select: { fullName: true, mrNo: true, age: true, sex: true } },
        samples: {
          orderBy: { collectedAt: 'asc' },
          select: {
            id: true, barcode: true, specimenType: true, collectedAt: true,
            orderLines: { select: { test: { select: { name: true } } } },
          },
        },
      },
    });
  },

  /**
   * The last released value of each parameter for this patient, from any
   * earlier test. A technician reading 5.4 today reads it differently when the
   * last result was 5.3 than when it was 9.8 — the change is what matters.
   */
  async previousResults(patientId: string, excludeOrderLineId: string, parameterIds: string[]) {
    const rows = await (await tenantDb()).resultValue.findMany({
      where: {
        parameterId: { in: parameterIds },
        value: { not: null },
        orderLine: {
          id: { not: excludeOrderLineId },
          status: { in: ['APPROVED', 'PRINTED', 'DELIVERED'] },
          visit: { patientId },
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: { parameterId: true, value: true, flag: true, updatedAt: true },
    });
    const latest = new Map<string, { value: string; flag: string; at: string }>();
    for (const r of rows) {
      if (!latest.has(r.parameterId) && r.value != null) {
        latest.set(r.parameterId, { value: r.value, flag: r.flag, at: r.updatedAt.toISOString() });
      }
    }
    return latest;
  },

  getApprovals: async (branchId: string) => labRepository.approvalsQueue(branchId),

  /**
   * Record that a visit's report left the lab: printed at the counter, or
   * delivered (handed over, or sent). Only released tests move; anything still
   * being worked on is left alone. Delivery also leaves a Delivery record of
   * how it went out.
   */
  async releaseVisit(visitId: string, to: 'PRINTED' | 'DELIVERED', actorId: string, channel?: 'PRINT' | 'WHATSAPP' | 'PORTAL' | 'EMAIL') {
    const db = await tenantDb();
    const from = to === 'PRINTED' ? ['APPROVED'] : ['APPROVED', 'PRINTED'];
    const lines = await db.orderLine.findMany({
      where: { visitId, status: { in: from as OrderLineStatus[] } },
      select: { id: true },
    });
    for (const l of lines) {
      await labService.transition(l.id, to, actorId);
    }
    if (to === 'DELIVERED' && channel && lines.length > 0) {
      const tenantId = await currentTenantId();
      const report = await db.report.findFirst({ where: { visitId }, select: { id: true } })
        ?? await db.report.create({ data: { tenantId, visitId, publicToken: randomBytes(24).toString('hex') }, select: { id: true } });
      await db.delivery.create({ data: { tenantId, reportId: report.id, channel, status: 'SENT' } });
    }
    return lines.length;
  },

  /**
   * Visits whose every test is released and not yet handed over — what the
   * counter has to give out or send. A visit with any test still in the lab
   * is not listed: half a report is not ready.
   */
  async readyToHandOver(branchId: string) {
    return (await tenantDb()).visit.findMany({
      where: {
        branchId,
        status: 'OPEN',
        orderLines: {
          some: { status: { in: ['APPROVED', 'PRINTED'] } },
          none: { status: { in: [...PENDING] } },
        },
      },
      select: {
        id: true, slipNo: true, bookedAt: true, updatedAt: true,
        patient: { select: { fullName: true, mrNo: true, mobile: true } },
        orderLines: { select: { status: true, test: { select: { name: true } } } },
      },
      orderBy: { bookedAt: 'asc' },
      take: 100,
    });
  },

  /** Whether the lab lets someone approve a result they entered themselves. */
  async allowSelfVerify(): Promise<boolean> {
    const tenant = await (await tenantDb()).tenant.findUniqueOrThrow({
      where: { id: await currentTenantId() },
      select: { allowSelfVerify: true },
    });
    return tenant.allowSelfVerify;
  },

  /**
   * Ask for a fresh sample. The reason goes on the test's history, and today's
   * queue token re-opens so the patient can be called back to the chair.
   */
  async requestRetake(orderLineId: string, actorId: string, reason: string) {
    const db = await tenantDb();
    const line = await db.orderLine.findUnique({ where: { id: orderLineId }, select: { status: true, visitId: true } });
    if (!line) throw new Error('Order line not found');
    const results = await db.resultValue.count({ where: { orderLineId, value: { not: null } } });
    if (results > 0) throw new Error('Results have been entered for this test. Clear them before asking for a retake.');
    await labService.transition(orderLineId, 'RETAKE', actorId, reason ? `Retake: ${reason}` : 'Retake requested');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await db.queueToken.updateMany({
      where: { visitId: line.visitId, status: 'DONE', at: { gte: today } },
      data: { status: 'WAITING' },
    });
  },

  /**
   * Send a collected sample to a reference lab. The test moves to Dispatched;
   * "Receive" brings it back when the reference lab's result arrives, and the
   * report says where it was performed.
   */
  async sendOut(orderLineId: string, partnerLabId: string, ref: string | null, actorId: string) {
    const db = await tenantDb();
    const [line, partner] = await Promise.all([
      db.orderLine.findUnique({ where: { id: orderLineId }, select: { status: true } }),
      db.partnerLab.findFirst({ where: { id: partnerLabId, direction: 'OUTWARD', isActive: true }, select: { id: true, name: true } }),
    ]);
    if (!line) throw new Error('Order line not found');
    if (!partner) throw new Error('Choose a reference lab to send it to.');
    if (line.status !== 'SAMPLE_COLLECTED') throw new Error('Only a collected sample can be sent out.');
    await db.orderLine.update({
      where: { id: orderLineId },
      data: { outsourcedToId: partner.id, outsourcedAt: new Date(), outsourceRef: ref },
    });
    await labService.transition(orderLineId, 'SAMPLE_DISPATCHED', actorId, `Sent to ${partner.name}${ref ? ` (${ref})` : ''}`);
  },

  /**
   * Save a culture result: growth or none, the organism and colony count, and
   * the antibiotics it is sensitive (S), intermediate (I) or resistant (R) to.
   * Moves the test to Result Saved the same way parameter results do.
   */
  async saveCulture(
    orderLineId: string,
    input: {
      growth: boolean; organism?: string; colonyCount?: string; incubation?: string; remarks?: string;
      sensitivities: { antibiotic: string; result: 'S' | 'I' | 'R'; mic?: string }[];
    },
    enteredById: string,
  ) {
    const db = await tenantDb();
    const line = await db.orderLine.findUnique({ where: { id: orderLineId }, select: { status: true, test: { select: { reportFormat: true } } } });
    if (!line) throw new Error('Order line not found');
    if (line.test.reportFormat !== 'CULTURE') throw new Error('This test is not a culture.');
    if (!canEnterResults(line.status as OrderLineStatus)) throw new Error('Results cannot be entered at this stage.');
    if (input.growth && !input.organism?.trim()) throw new Error('Name the organism that grew.');
    const tenantId = await currentTenantId();
    const from = line.status as OrderLineStatus;
    await db.$transaction(async (tx) => {
      const data = {
        growth: input.growth,
        organism: input.growth ? input.organism?.trim() || null : null,
        colonyCount: input.growth ? input.colonyCount?.trim() || null : null,
        incubation: input.incubation?.trim() || null,
        remarks: input.remarks?.trim() || null,
      };
      const existing = await tx.cultureResult.findUnique({ where: { orderLineId }, select: { id: true } });
      const cr = existing
        ? await tx.cultureResult.update({ where: { orderLineId }, data, select: { id: true } })
        : await tx.cultureResult.create({ data: { tenantId, orderLineId, ...data }, select: { id: true } });
      await tx.cultureSensitivity.deleteMany({ where: { cultureResultId: cr.id } });
      if (input.growth) {
        for (const [i, row] of input.sensitivities.entries()) {
          await tx.cultureSensitivity.create({
            data: { tenantId, cultureResultId: cr.id, antibiotic: row.antibiotic, result: row.result, mic: row.mic?.trim() || null, sortOrder: i },
          });
        }
      }
      if (from !== 'RESULT_SAVED') {
        if (from !== 'IN_PROGRESS') {
          assertTransition(from, 'IN_PROGRESS');
          await logEvent(tx, orderLineId, from, 'IN_PROGRESS', enteredById, 'Started by entering results');
        }
        assertTransition('IN_PROGRESS', 'RESULT_SAVED');
        await tx.orderLine.update({ where: { id: orderLineId }, data: { status: 'RESULT_SAVED' } });
        await logEvent(tx, orderLineId, 'IN_PROGRESS', 'RESULT_SAVED', enteredById, 'Culture result entered');
      } else {
        await logEvent(tx, orderLineId, 'RESULT_SAVED', 'RESULT_SAVED', enteredById, 'Culture result edited');
      }
    });
  },

  /** Record why a test is running late. Shown on the board and the delayed-tests report. */
  async markDelayed(orderLineId: string, actorId: string, reason: string) {
    const db = await tenantDb();
    const line = await db.orderLine.findUnique({ where: { id: orderLineId }, select: { status: true, delayReason: true } });
    if (!line) throw new Error('Order line not found');
    if (['APPROVED', 'PRINTED', 'DELIVERED', 'CANCELLED'].includes(line.status)) {
      throw new Error('This test is already finished.');
    }
    const tenantId = await currentTenantId();
    await db.$transaction(async (tx) => {
      await tx.orderLine.update({ where: { id: orderLineId }, data: { delayReason: reason, delayedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          tenantId, actorId, entity: 'OrderLine', entityId: orderLineId, action: 'DELAY',
          before: JSON.stringify({ delayReason: line.delayReason }), after: JSON.stringify({ delayReason: reason }),
        },
      });
    });
  },

  /** Advance an order line one step (collect, start, print, etc.). */
  async transition(orderLineId: string, to: OrderLineStatus, actorId: string, note?: string) {
    const line = await (await tenantDb()).orderLine.findUnique({
      where: { id: orderLineId },
      include: { visit: { select: { slipNo: true } }, test: { select: { specimenType: true } } },
    });
    if (!line) throw new Error('Order line not found');
    const from = line.status as OrderLineStatus;
    assertTransition(from, to);
    await (await tenantDb()).$transaction(async (tx) => {
      await tx.orderLine.update({ where: { id: orderLineId }, data: { status: to } });
      await logEvent(tx, orderLineId, from, to, actorId, note);

      // A collected test goes into a tube, and the tube is a record: its
      // barcode, who drew it and when. Tests needing the same specimen share
      // one tube per visit. A retake is a fresh draw, so it always gets its own.
      if (to === 'SAMPLE_COLLECTED') {
        const spec = line.test.specimenType;
        const existing = from === 'RETAKE'
          ? null
          : await tx.sample.findFirst({ where: { visitId: line.visitId, specimenType: spec }, orderBy: { collectedAt: 'desc' } });
        let sampleId = existing?.id;
        if (!sampleId) {
          const prior = await tx.sample.count({ where: { visitId: line.visitId, specimenType: spec } });
          const base = `${line.visit.slipNo}-${SPECIMEN_CODE[spec] ?? 'OTH'}-${line.visitId.slice(-4).toUpperCase()}`;
          const created = await tx.sample.create({
            data: {
              tenantId: await currentTenantId(),
              visitId: line.visitId,
              specimenType: spec,
              barcode: prior > 0 ? `${base}-R${prior}` : base,
              collectedAt: new Date(),
              collectedById: actorId,
            },
          });
          sampleId = created.id;
        }
        await tx.orderLine.update({ where: { id: orderLineId }, data: { sampleId } });
      }

      // The waiting-room token exists to call a patient in for collection.
      // Once nothing on the visit still needs drawing, that job is finished —
      // left WAITING, "Call next" would summon someone already served, and the
      // TV would keep their number up. Closed in the same transaction as the
      // status change, so the queue and the lab can never disagree.
      if (to === 'SAMPLE_COLLECTED' || to === 'CANCELLED') {
        const stillToDraw = await tx.orderLine.count({
          where: { visitId: line.visitId, status: { in: ['BOOKED', 'RETAKE'] } },
        });
        if (stillToDraw === 0) {
          await tx.queueToken.updateMany({
            where: { visitId: line.visitId, status: { not: 'DONE' } },
            data: { status: 'DONE' },
          });
        }
      }
    });
    await completeVisitIfDone(line.visitId);
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
    remarks?: string,
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
      cutoff: p.cutoff != null ? Number(p.cutoff) : null,
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
      if (remarks !== undefined) {
        await tx.orderLine.update({ where: { id: orderLineId }, data: { remarks: remarks.trim() || null } });
      }

      // Entering results straight from a collected (or received) sample walks
      // through IN_PROGRESS, so the history reads the same as it always did
      // without anyone pressing a button just to say work had begun.
      if (from !== 'RESULT_SAVED') {
        if (from !== 'IN_PROGRESS') {
          assertTransition(from, 'IN_PROGRESS');
          await logEvent(tx, orderLineId, from, 'IN_PROGRESS', enteredById, 'Started by entering results');
        }
        assertTransition('IN_PROGRESS', 'RESULT_SAVED');
        await tx.orderLine.update({ where: { id: orderLineId }, data: { status: 'RESULT_SAVED' } });
        await logEvent(tx, orderLineId, 'IN_PROGRESS', 'RESULT_SAVED', enteredById, 'Results entered');
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
      include: {
        results: true,
        test: { select: { reportFormat: true } },
        culture: { select: { id: true } },
        workflowEvents: { where: { toState: 'RESULT_SAVED' }, orderBy: { at: 'desc' }, take: 1, select: { actorId: true } },
      },
    });
    if (!line) throw new Error('Order line not found');
    const from = line.status as OrderLineStatus;
    assertTransition(from, 'APPROVED');
    const isCulture = line.test.reportFormat === 'CULTURE';
    if (isCulture && !line.culture) throw new Error('Enter the culture result before approving.');

    // A calculated value is blank when an input it needs was missing or the
    // formula failed. Releasing the report anyway prints "—" where a patient
    // expects, say, their LDL — so approval stops here and says which one.
    const calculated = await (await tenantDb()).testParameter.findMany({
      where: { testId: line.testId, valueType: 'CALCULATED' },
      select: { id: true, name: true },
    });
    const blank = calculated.filter(
      (p) => !line.results.some((r) => r.parameterId === p.id && r.value != null && r.value.trim() !== ''),
    );
    if (blank.length > 0) {
      throw new Error(
        `Cannot approve: ${blank.map((b) => b.name).join(', ')} ${blank.length === 1 ? 'has' : 'have'} no value. ` +
        'Open the result, check the inputs and save again.',
      );
    }

    // A culture has no result values; whoever last saved it is who entered it.
    const enteredByThisUser = line.results.some((r) => r.enteredById === approver.id)
      || (isCulture && line.workflowEvents[0]?.actorId === approver.id);
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

  completeVisitIfDone,

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
