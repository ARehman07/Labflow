'use server';

import { requirePermission } from '@/core/rbac/guard';
import { adminService } from './admin.service';
import { branchSchema, departmentSchema, doctorSchema, userSchema, testSchema } from './admin.schema';

export type Res = { ok: true } | { ok: false; error: string };

function latestPrice(prices: { price: unknown; effectiveFrom: Date }[]): number {
  if (!prices.length) return 0;
  return Number([...prices].sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0].price);
}

// ── Branches ──
export interface BranchDTO { id: string; name: string; address: string | null; phone: string | null }
export async function listBranchesAction(): Promise<BranchDTO[]> {
  await requirePermission('admin.manage');
  return (await adminService.listBranches()).map((b) => ({ id: b.id, name: b.name, address: b.address, phone: b.phone }));
}
export async function createBranchAction(input: unknown): Promise<Res> {
  await requirePermission('admin.manage');
  const p = branchSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Invalid' };
  await adminService.createBranch(p.data);
  return { ok: true };
}

// ── Departments ──
export interface DepartmentDTO { id: string; name: string; testCount: number }
export async function listDepartmentsAction(): Promise<DepartmentDTO[]> {
  await requirePermission('admin.manage');
  return (await adminService.listDepartments()).map((d) => ({ id: d.id, name: d.name, testCount: d._count.tests }));
}
export async function createDepartmentAction(input: unknown): Promise<Res> {
  await requirePermission('admin.manage');
  const p = departmentSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Invalid' };
  await adminService.createDepartment(p.data.name);
  return { ok: true };
}

// ── Doctors ──
export interface DoctorDTO { id: string; name: string; clinic: string | null; commissionPct: number }
export async function listDoctorsAction(): Promise<DoctorDTO[]> {
  await requirePermission('admin.manage');
  return (await adminService.listDoctors()).map((d) => ({ id: d.id, name: d.name, clinic: d.clinic, commissionPct: Number(d.commissionPct) }));
}
export async function createDoctorAction(input: unknown): Promise<Res> {
  await requirePermission('admin.manage');
  const p = doctorSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Invalid' };
  await adminService.createDoctor(p.data);
  return { ok: true };
}

// ── Users ──
export interface RoleDTO { id: string; name: string }
export interface UserDTO { id: string; fullName: string; username: string; role: string; branch: string | null }
export async function listRolesAction(): Promise<RoleDTO[]> {
  await requirePermission('user.manage');
  return (await adminService.listRoles()).map((r) => ({ id: r.id, name: r.name }));
}
export async function listUsersAction(): Promise<UserDTO[]> {
  await requirePermission('user.manage');
  return (await adminService.listUsers()).map((u) => ({
    id: u.id, fullName: u.fullName, username: u.username, role: u.role.name, branch: u.branch?.name ?? null,
  }));
}
export async function createUserAction(input: unknown): Promise<Res> {
  await requirePermission('user.manage');
  const p = userSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Invalid' };
  try {
    await adminService.createUser(p.data);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Username already exists.' };
  }
}

// ── Stringified rows for the generic EntityManager ──
export async function branchRows(): Promise<Record<string, string>[]> {
  return (await listBranchesAction()).map((b) => ({ name: b.name, address: b.address ?? '—', phone: b.phone ?? '—' }));
}
export async function departmentRows(): Promise<Record<string, string>[]> {
  return (await listDepartmentsAction()).map((d) => ({ name: d.name, testCount: String(d.testCount) }));
}
export async function doctorRows(): Promise<Record<string, string>[]> {
  return (await listDoctorsAction()).map((d) => ({ name: d.name, clinic: d.clinic ?? '—', commissionPct: `${d.commissionPct}%` }));
}
export async function userRows(): Promise<Record<string, string>[]> {
  return (await listUsersAction()).map((u) => ({ fullName: u.fullName, username: u.username, role: u.role, branch: u.branch ?? '—' }));
}

// ── Tests ──
export interface TestListDTO { id: string; name: string; code: string; department: string; price: number; paramCount: number }
export async function listTestsAction(): Promise<TestListDTO[]> {
  await requirePermission('admin.manage');
  return (await adminService.listTests()).map((t) => ({
    id: t.id, name: t.name, code: t.code, department: t.department.name, price: latestPrice(t.prices), paramCount: t._count.parameters,
  }));
}

export interface TestParamDTO {
  name: string; code: string; unit: string; valueType: string; options: string;
  isBold: boolean; refLow: string; refHigh: string; refText: string; formula: string;
}
export interface TestEditDTO {
  id: string; name: string; code: string; departmentId: string; tatHours: number; specimenType: string; price: number;
  parameters: TestParamDTO[];
}
export async function getTestAction(id: string): Promise<TestEditDTO | null> {
  await requirePermission('admin.manage');
  const t = await adminService.getTest(id);
  if (!t) return null;
  return {
    id: t.id, name: t.name, code: t.code, departmentId: t.departmentId, tatHours: t.tatHours,
    specimenType: t.specimenType, price: latestPrice(t.prices),
    parameters: t.parameters.map((p) => {
      const r = p.referenceRanges[0];
      return {
        name: p.name, code: p.code, unit: p.unit ?? '', valueType: p.valueType, options: p.options ?? '',
        isBold: p.isBold,
        refLow: r?.low != null ? String(Number(r.low)) : '',
        refHigh: r?.high != null ? String(Number(r.high)) : '',
        refText: r?.displayText ?? '',
        formula: p.formula?.expression ?? '',
      };
    }),
  };
}

export async function saveTestAction(id: string | null, input: unknown): Promise<Res & { id?: string }> {
  const user = await requirePermission('admin.manage');
  const p = testSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Invalid test' };
  const branchId = user.branchId;
  if (!branchId) return { ok: false, error: 'Your account has no branch assigned.' };
  try {
    const res = id ? await adminService.updateTest(id, p.data, branchId) : await adminService.createTest(p.data, branchId);
    return { ok: true, id: res.id };
  } catch (e) {
    const msg = e instanceof Error && /Foreign key|constraint/i.test(e.message)
      ? 'Cannot restructure a test that already has saved results.'
      : 'Save failed. Check the test code is unique.';
    return { ok: false, error: msg };
  }
}
