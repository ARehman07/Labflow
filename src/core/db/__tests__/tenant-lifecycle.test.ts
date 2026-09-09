import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { unscopedPrisma as prisma } from '../tenant';
import { deleteTenant, tenantRowCounts } from '../tenant-lifecycle';

/**
 * Offboarding must remove everything and leave other labs untouched.
 * A half-deleted tenant is worse than one never deleted.
 */
const CODE = 'lifecycle-a';
const NEIGHBOUR = 'lifecycle-b';

async function seedTenant(code: string) {
  const tenant = await prisma.tenant.create({ data: { code, name: code } });
  const t = tenant.id;
  const branch = await prisma.branch.create({ data: { tenantId: t, name: 'Main' } });
  const role = await prisma.role.create({ data: { tenantId: t, name: 'Tech' } });
  const user = await prisma.user.create({
    data: { tenantId: t, fullName: 'U', username: `u-${code}`, passwordHash: 'x', roleId: role.id },
  });
  const dept = await prisma.department.create({ data: { tenantId: t, name: 'Chem' } });
  const test = await prisma.test.create({
    data: { tenantId: t, code: `T-${code}`, name: 'Test', departmentId: dept.id },
  });
  const param = await prisma.testParameter.create({
    data: { tenantId: t, testId: test.id, code: 'V1', name: 'V', valueType: 'NUMBER' },
  });
  await prisma.referenceRange.create({ data: { tenantId: t, parameterId: param.id, low: 1, high: 2 } });
  const patient = await prisma.patient.create({
    data: { tenantId: t, mrNo: `MR-${code}`, fullName: 'P', mobile: '03001234567' },
  });
  const card = await prisma.familyCard.create({
    data: { tenantId: t, mobile: '03001234567', primaryPatientId: patient.id },
  });
  await prisma.familyCardMember.create({
    data: { tenantId: t, cardId: card.id, patientId: patient.id },
  });
  const visit = await prisma.visit.create({
    data: { tenantId: t, slipNo: 'S-1', patientId: patient.id, branchId: branch.id, createdById: user.id },
  });
  const line = await prisma.orderLine.create({
    data: { tenantId: t, visitId: visit.id, testId: test.id },
  });
  const rv = await prisma.resultValue.create({
    data: { tenantId: t, orderLineId: line.id, parameterId: param.id, value: '5', flag: 'CRITICAL' },
  });
  await prisma.criticalNotification.create({ data: { tenantId: t, resultValueId: rv.id } });
  await prisma.invoice.create({
    data: { tenantId: t, visitId: visit.id, grossAmount: 100, netAmount: 100 },
  });
  return t;
}

beforeEach(async () => {
  for (const c of [CODE, NEIGHBOUR]) {
    const existing = await prisma.tenant.findUnique({ where: { code: c } });
    if (existing) await deleteTenant(existing.id);
  }
});

afterAll(async () => {
  for (const c of [CODE, NEIGHBOUR]) {
    const existing = await prisma.tenant.findUnique({ where: { code: c } });
    if (existing) await deleteTenant(existing.id);
  }
});

describe('tenant offboarding (G19)', () => {
  it('removes a fully-populated tenant', async () => {
    const id = await seedTenant(CODE);
    const before = await tenantRowCounts(id);
    expect(Object.keys(before).length).toBeGreaterThan(8);

    const report = await deleteTenant(id);
    expect(report.tenantCode).toBe(CODE);
    expect(report.total).toBeGreaterThan(0);

    expect(await prisma.tenant.findUnique({ where: { id } })).toBeNull();
    expect(Object.keys(await tenantRowCounts(id))).toEqual([]);
  });

  it('leaves other tenants completely untouched', async () => {
    const doomed = await seedTenant(CODE);
    const survivor = await seedTenant(NEIGHBOUR);
    const before = await tenantRowCounts(survivor);

    await deleteTenant(doomed);

    expect(await tenantRowCounts(survivor)).toEqual(before);
    expect(await prisma.tenant.findUnique({ where: { id: survivor } })).not.toBeNull();
  });

  it('refuses an unknown tenant rather than deleting nothing quietly', async () => {
    await expect(deleteTenant('does-not-exist')).rejects.toThrow('Tenant not found');
  });

  it('frees the code for reuse', async () => {
    const id = await seedTenant(CODE);
    await deleteTenant(id);
    const reissued = await prisma.tenant.create({ data: { code: CODE, name: 'Reissued' } });
    expect(reissued.code).toBe(CODE);
    await deleteTenant(reissued.id);
  });
});
