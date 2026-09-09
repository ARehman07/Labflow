import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { forTenant, unscopedPrisma } from '../tenant';
import { deleteTenant } from '../tenant-lifecycle';

/**
 * Proves the extension actually isolates, rather than merely being wired up.
 * Two labs, one patient each, and every cross-tenant access must come back
 * empty — never another lab's row.
 */
const A = { code: 'test-lab-a', name: 'Lab A' };
const B = { code: 'test-lab-b', name: 'Lab B' };

let tenantA: string;
let tenantB: string;
let patientA: string;
let patientB: string;

beforeAll(async () => {
  const a = await unscopedPrisma.tenant.upsert({
    where: { code: A.code }, update: {}, create: A,
  });
  const b = await unscopedPrisma.tenant.upsert({
    where: { code: B.code }, update: {}, create: B,
  });
  tenantA = a.id;
  tenantB = b.id;

  const pa = await unscopedPrisma.patient.upsert({
    where: { tenantId_mrNo: { tenantId: tenantA, mrNo: 'ISO-1' } },
    update: {},
    create: { tenantId: tenantA, mrNo: 'ISO-1', fullName: 'Patient A', mobile: '03001112222' },
  });
  const pb = await unscopedPrisma.patient.upsert({
    where: { tenantId_mrNo: { tenantId: tenantB, mrNo: 'ISO-1' } },
    update: {},
    create: { tenantId: tenantB, mrNo: 'ISO-1', fullName: 'Patient B', mobile: '03001112222' },
  });
  patientA = pa.id;
  patientB = pb.id;
});

afterAll(async () => {
  for (const id of [tenantA, tenantB]) {
    if (id) await deleteTenant(id);
  }
});

describe('tenant isolation', () => {
  it('the same mrNo can exist in two labs', async () => {
    expect(patientA).not.toBe(patientB);
  });

  it('findMany returns only the current tenant', async () => {
    const rows = await forTenant(tenantA).patient.findMany({ where: { mrNo: 'ISO-1' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].fullName).toBe('Patient A');
  });

  it('findUnique cannot reach another tenant by id', async () => {
    const row = await forTenant(tenantA).patient.findUnique({ where: { id: patientB } });
    expect(row).toBeNull();
  });

  it('update cannot touch another tenant', async () => {
    await expect(
      forTenant(tenantA).patient.update({
        where: { id: patientB },
        data: { fullName: 'HIJACKED' },
      }),
    ).rejects.toThrow();

    const untouched = await unscopedPrisma.patient.findUniqueOrThrow({ where: { id: patientB } });
    expect(untouched.fullName).toBe('Patient B');
  });

  it('delete cannot remove another tenant\'s row', async () => {
    await expect(
      forTenant(tenantA).patient.delete({ where: { id: patientB } }),
    ).rejects.toThrow();
    expect(await unscopedPrisma.patient.count({ where: { id: patientB } })).toBe(1);
  });

  it('deleteMany scoped to A leaves B intact', async () => {
    const created = await forTenant(tenantA).patient.create({
      data: { tenantId: tenantA, mrNo: 'ISO-TMP', fullName: 'Temp' },
    });
    await forTenant(tenantA).patient.deleteMany({ where: { mrNo: 'ISO-TMP' } });
    expect(await unscopedPrisma.patient.count({ where: { id: created.id } })).toBe(0);
    expect(await unscopedPrisma.patient.count({ where: { id: patientB } })).toBe(1);
  });

  it('create is stamped with the tenant even when omitted at the call site', async () => {
    // tenantId is omitted at the call site on purpose. The types require it
    // (the column is NOT NULL), so this cast mimics code that slipped past
    // review; the extension must still stamp the right tenant.
    const row = await forTenant(tenantB).patient.create({
      data: { mrNo: 'ISO-STAMP', fullName: 'Stamped' } as never,
    });
    expect(row.tenantId).toBe(tenantB);
    await unscopedPrisma.patient.delete({ where: { id: row.id } });
  });

  it('count is scoped', async () => {
    const a = await forTenant(tenantA).patient.count();
    const b = await forTenant(tenantB).patient.count();
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});
