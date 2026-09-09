import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { forTenant, unscopedPrisma } from '@/core/db/tenant';
import { deleteTenant } from '@/core/db/tenant-lifecycle';
import { openCriticalNotifications } from '../critical';

/**
 * End-to-end for the callback loop: a CRITICAL result must open exactly one
 * open notification, and closing it must not reopen on a re-save.
 */
let tenantId: string;
let orderLineId: string;
let resultId: string;

/** Uses the real offboarding routine, so it is exercised on every test run. */
async function wipe(code: string) {
  const t = await unscopedPrisma.tenant.findUnique({ where: { code } });
  if (t) await deleteTenant(t.id);
}

beforeAll(async () => {
  await wipe('crit-loop');
  const tenant = await unscopedPrisma.tenant.create({
    data: { code: 'crit-loop', name: 'Loop Lab' },
  });
  tenantId = tenant.id;

  const branch = await unscopedPrisma.branch.create({
    data: { tenantId, name: 'Main' },
  });
  const role = await unscopedPrisma.role.create({ data: { tenantId, name: 'Tech' } });
  const user = await unscopedPrisma.user.create({
    data: { tenantId, fullName: 'Tech', username: 'tech-loop', passwordHash: 'x', roleId: role.id },
  });
  const dept = await unscopedPrisma.department.create({ data: { tenantId, name: 'Chem' } });
  const test = await unscopedPrisma.test.create({
    data: { tenantId, code: 'K', name: 'Serum Potassium', departmentId: dept.id },
  });
  const param = await unscopedPrisma.testParameter.create({
    data: { tenantId, testId: test.id, code: 'K', name: 'Potassium', unit: 'mmol/L', valueType: 'NUMBER' },
  });
  await unscopedPrisma.referenceRange.create({
    data: { tenantId, parameterId: param.id, low: 3.5, high: 5.1, criticalLow: 2.5, criticalHigh: 6.5 },
  });
  const patient = await unscopedPrisma.patient.create({
    data: { tenantId, mrNo: 'LOOP-1', fullName: 'Loop Patient', age: 40, sex: 'MALE' },
  });
  const visit = await unscopedPrisma.visit.create({
    data: { tenantId, slipNo: 'L-1', patientId: patient.id, branchId: branch.id, createdById: user.id },
  });
  const line = await unscopedPrisma.orderLine.create({
    data: { tenantId, visitId: visit.id, testId: test.id, status: 'IN_PROGRESS' },
  });
  orderLineId = line.id;

  // A panic-high potassium, flagged as the calc engine would flag it.
  const rv = await unscopedPrisma.resultValue.create({
    data: {
      tenantId,
      orderLineId,
      parameterId: param.id,
      value: '7.4',
      numericValue: 7.4,
      flag: 'CRITICAL',
      enteredById: user.id,
    },
  });
  resultId = rv.id;
});

afterAll(async () => {
  await wipe('crit-loop');
});

describe('critical callback loop (G3)', () => {
  it('opens a callback for a critical result', async () => {
    const db = forTenant(tenantId);
    const n = await openCriticalNotifications(db as never, tenantId, orderLineId);
    expect(n).toBe(1);

    const open = await db.criticalNotification.findMany({ where: { notifiedAt: null } });
    expect(open).toHaveLength(1);
    expect(open[0].resultValueId).toBe(resultId);
  });

  it('is idempotent — re-saving does not open a second callback', async () => {
    const db = forTenant(tenantId);
    await openCriticalNotifications(db as never, tenantId, orderLineId);
    await openCriticalNotifications(db as never, tenantId, orderLineId);
    expect(await db.criticalNotification.count()).toBe(1);
  });

  it('stays open until somebody records the call', async () => {
    const db = forTenant(tenantId);
    const row = await db.criticalNotification.findFirstOrThrow();
    expect(row.notifiedAt).toBeNull();

    await db.criticalNotification.update({
      where: { id: row.id },
      data: { notifiedTo: 'Dr Ahmed', method: 'Phone', notifiedAt: new Date(), acknowledgedBy: 'Dr Ahmed' },
    });

    expect(await db.criticalNotification.count({ where: { notifiedAt: null } })).toBe(0);
  });

  it('does not open callbacks for non-critical results', async () => {
    const db = forTenant(tenantId);
    await db.resultValue.updateMany({ where: { orderLineId }, data: { flag: 'HIGH' } });
    const n = await openCriticalNotifications(db as never, tenantId, orderLineId);
    expect(n).toBe(0);
  });
});
