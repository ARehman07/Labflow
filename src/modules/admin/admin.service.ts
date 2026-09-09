import bcrypt from 'bcryptjs';
import { tenantDb, currentTenantId } from '@/core/db/context';
import type { TenantTransactionClient } from '@/core/db/tenant';
import type { TestInput, ParameterInput } from './admin.schema';

/** Extract variable names referenced by a formula expression. */
function extractVars(expr: string): string[] {
  return [...new Set(expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])];
}

async function writeParameters(
  tx: TenantTransactionClient,
  testId: string,
  parameters: ParameterInput[],
) {
  for (let i = 0; i < parameters.length; i++) {
    const p = parameters[i];
    const param = await tx.testParameter.create({
      data: { tenantId: await currentTenantId(),
        testId,
        name: p.name,
        code: p.code,
        unit: p.unit ?? null,
        valueType: p.valueType,
        options: p.options ?? null,
        isBold: p.isBold,
        sortOrder: i + 1,
      },
    });
    if (p.refLow !== undefined || p.refHigh !== undefined || p.refText) {
      await tx.referenceRange.create({
        data: { tenantId: await currentTenantId(),
          parameterId: param.id,
          sex: 'ANY',
          low: p.refLow ?? null,
          high: p.refHigh ?? null,
          displayText: p.refText ?? null,
        },
      });
    }
    if (p.formula) {
      await tx.parameterFormula.create({
        data: { tenantId: await currentTenantId(), parameterId: param.id, expression: p.formula, inputs: JSON.stringify(extractVars(p.formula)) },
      });
    }
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
        },
      });
      await writeParameters(tx, test.id, input.parameters);
      await tx.testPrice.create({
        data: { tenantId: await currentTenantId(), testId: test.id, branchId, price: input.price, effectiveFrom: new Date() },
      });
      return { id: test.id };
    });
  },

  /** Update a test. Parameters are replaced; this fails (safely) if any existing
   *  parameter already has results, protecting historical data. */
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
        },
      });
      // Replace parameters (delete cascades ranges/formula; blocked by FK if results exist)
      await tx.testParameter.deleteMany({ where: { testId: id } });
      await writeParameters(tx, id, input.parameters);
      // Update / add current price
      await tx.testPrice.create({
        data: { tenantId: await currentTenantId(), testId: id, branchId, price: input.price, effectiveFrom: new Date() },
      });
      return { id };
    });
  },
};
