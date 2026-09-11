import bcrypt from 'bcryptjs';
import { tenantDb, currentTenantId } from '@/core/db/context';
import type { TenantTransactionClient } from '@/core/db/tenant';
import type { TestInput, ParameterInput, RangeInput } from './admin.schema';

/** Ages are stored in days so a newborn and an adult compare with one operator. */
export const DAYS_PER = { YEARS: 365, MONTHS: 30, DAYS: 1 } as const;
/** "No upper age" — about 120 years, the schema's default. */
export const MAX_AGE_DAYS = 43800;

/** Extract variable names referenced by a formula expression. */
function extractVars(expr: string): string[] {
  return [...new Set(expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])];
}

async function writeRangesAndFormula(tx: TenantTransactionClient, parameterId: string, p: ParameterInput) {
  // Several ranges per parameter — by sex and by age band — each with its own
  // normal and critical limits. A payload from before ranges existed still
  // arrives as a single refLow/refHigh/refText, and is saved as one range.
  const legacy: RangeInput[] = p.refLow !== undefined || p.refHigh !== undefined || p.refText
    ? [{ sex: 'ANY', ageUnit: 'YEARS', low: p.refLow, high: p.refHigh, text: p.refText }]
    : [];
  const ranges = p.ranges.length > 0 ? p.ranges : legacy;
  for (const r of ranges) {
    const empty = [r.ageMin, r.ageMax, r.low, r.high, r.criticalLow, r.criticalHigh, r.text].every((v) => v === undefined);
    if (empty) continue;
    const perUnit = DAYS_PER[r.ageUnit ?? 'YEARS'];
    await tx.referenceRange.create({
      data: { tenantId: await currentTenantId(),
        parameterId,
        sex: r.sex ?? 'ANY',
        ageMinDays: r.ageMin !== undefined ? Math.round(r.ageMin * perUnit) : 0,
        ageMaxDays: r.ageMax !== undefined ? Math.round(r.ageMax * perUnit) : MAX_AGE_DAYS,
        low: r.low ?? null,
        high: r.high ?? null,
        criticalLow: r.criticalLow ?? null,
        criticalHigh: r.criticalHigh ?? null,
        displayText: r.text ?? null,
      },
    });
  }
  if (p.formula) {
    await tx.parameterFormula.create({
      data: { tenantId: await currentTenantId(), parameterId, expression: p.formula, inputs: JSON.stringify(extractVars(p.formula)) },
    });
  }
}

function parameterFields(p: ParameterInput, sortOrder: number) {
  return {
    name: p.name,
    code: p.code,
    unit: p.unit ?? null,
    valueType: p.valueType,
    options: p.options ?? null,
    isBold: p.isBold,
    cutoff: p.valueType === 'CUTOFF' ? (p.cutoff ?? null) : null,
    positiveLabel: p.valueType === 'CUTOFF' ? (p.positiveLabel ?? null) : null,
    negativeLabel: p.valueType === 'CUTOFF' ? (p.negativeLabel ?? null) : null,
    sortOrder,
  };
}

async function writeParameters(
  tx: TenantTransactionClient,
  testId: string,
  parameters: ParameterInput[],
) {
  for (let i = 0; i < parameters.length; i++) {
    const p = parameters[i];
    const param = await tx.testParameter.create({
      data: { tenantId: await currentTenantId(), testId, ...parameterFields(p, i + 1) },
    });
    await writeRangesAndFormula(tx, param.id, p);
  }
}

/** Thrown when a parameter that already has results is removed from a test. */
export class ParameterInUseError extends Error {
  constructor(names: string[]) {
    super(`A parameter that already has results cannot be removed: ${names.join(', ')}.`);
    this.name = 'ParameterInUseError';
  }
}

export const adminService = {
  // ── Branches ──
  listBranches: async () => (await tenantDb()).branch.findMany({ orderBy: { name: 'asc' } }),
  createBranch: async (d: { name: string; address?: string; phone?: string }) =>
    (await tenantDb()).branch.create({ data: { tenantId: await currentTenantId(), name: d.name, address: d.address ?? null, phone: d.phone ?? null } }),

  // ── Departments ──
  listDepartments: async () => (await tenantDb()).department.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { tests: true } } } }),
  createDepartment: async (name: string) => (await tenantDb()).department.create({ data: { tenantId: await currentTenantId(), name } }),

  // ── Doctors ──
  listDoctors: async () => (await tenantDb()).doctor.findMany({ orderBy: { name: 'asc' } }),
  createDoctor: async (d: { name: string; clinic?: string; commissionPct: number }) =>
    (await tenantDb()).doctor.create({ data: { tenantId: await currentTenantId(), name: d.name, clinic: d.clinic ?? null, commissionPct: d.commissionPct } }),

  // ── Users & roles ──
  listRoles: async () => (await tenantDb()).role.findMany({ orderBy: { name: 'asc' } }),
  listUsers: async () => (await tenantDb()).user.findMany({ include: { role: true, branch: true }, orderBy: { createdAt: 'desc' } }),
  async createUser(d: { fullName: string; username: string; password: string; roleId: string; branchId?: string }) {
    const passwordHash = await bcrypt.hash(d.password, 10);
    return (await tenantDb()).user.create({
      data: { tenantId: await currentTenantId(), fullName: d.fullName, username: d.username, passwordHash, roleId: d.roleId, branchId: d.branchId ?? null },
    });
  },

  // ── Test catalog ──
  listTests: async () =>
    (await tenantDb()).test.findMany({
      include: { department: true, prices: true, _count: { select: { parameters: true } } },
      orderBy: { name: 'asc' },
    }),

  getTest: async (id: string) =>
    (await tenantDb()).test.findUnique({
      where: { id },
      include: {
        prices: true,
        parameters: { orderBy: { sortOrder: 'asc' }, include: { referenceRanges: true, formula: true } },
      },
    }),

  async createTest(input: TestInput, branchId: string) {
    return (await tenantDb()).$transaction(async (tx) => {
      const test = await tx.test.create({
        data: { tenantId: await currentTenantId(),
          name: input.name,
          code: input.code,
          departmentId: input.departmentId,
          tatHours: input.tatHours,
          specimenType: input.specimenType,
          methodNote: input.methodNote ?? null,
          reportFormat: input.reportFormat,
        },
      });
      await writeParameters(tx, test.id, input.parameters);
      await tx.testPrice.create({
        data: { tenantId: await currentTenantId(), testId: test.id, branchId, price: input.price, effectiveFrom: new Date() },
      });
      return { id: test.id };
    });
  },

  /**
   * Update a test.
   *
   * Parameters are updated in place, matched by code, so results already
   * recorded against them stay attached. They used to be deleted and
   * recreated, which the database refused the moment any result existed — so
   * a test that had ever been used could not have even a reference range
   * corrected. Only a parameter removed from the test is deleted, and one that
   * already has results is refused by name.
   */
  async updateTest(id: string, input: TestInput, branchId: string) {
    return (await tenantDb()).$transaction(async (tx) => {
      await tx.test.update({
        where: { id },
        data: {
          name: input.name,
          code: input.code,
          departmentId: input.departmentId,
          tatHours: input.tatHours,
          specimenType: input.specimenType,
          methodNote: input.methodNote ?? null,
          reportFormat: input.reportFormat,
        },
      });

      const existing = await tx.testParameter.findMany({
        where: { testId: id },
        select: { id: true, code: true, name: true, _count: { select: { results: true } } },
      });
      const byCode = new Map(existing.map((e) => [e.code, e]));
      const kept = new Set<string>();

      for (let i = 0; i < input.parameters.length; i++) {
        const p = input.parameters[i];
        const match = byCode.get(p.code);
        if (match) {
          kept.add(match.id);
          await tx.testParameter.update({ where: { id: match.id }, data: parameterFields(p, i + 1) });
          await tx.referenceRange.deleteMany({ where: { parameterId: match.id } });
          await tx.parameterFormula.deleteMany({ where: { parameterId: match.id } });
          await writeRangesAndFormula(tx, match.id, p);
        } else {
          const created = await tx.testParameter.create({
            data: { tenantId: await currentTenantId(), testId: id, ...parameterFields(p, i + 1) },
          });
          await writeRangesAndFormula(tx, created.id, p);
        }
      }

      const removed = existing.filter((e) => !kept.has(e.id));
      const withResults = removed.filter((e) => e._count.results > 0);
      if (withResults.length > 0) throw new ParameterInUseError(withResults.map((e) => e.name));
      if (removed.length > 0) {
        await tx.testParameter.deleteMany({ where: { id: { in: removed.map((e) => e.id) } } });
      }

      // Update / add current price
      await tx.testPrice.create({
        data: { tenantId: await currentTenantId(), testId: id, branchId, price: input.price, effectiveFrom: new Date() },
      });
      return { id };
    });
  },
};
