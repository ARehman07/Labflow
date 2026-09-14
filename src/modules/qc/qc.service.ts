import { tenantDb, currentTenantId } from '@/core/db/context';
import { notifyStaff } from '@/modules/notifications/notify';
import { westgard } from './westgard';

/** A refusal written for the person at the screen. */
export class QcError extends Error {}

/**
 * Internal quality control: control materials with a target mean and SD, and
 * the runs recorded against them. Each run is judged by Westgard rules the
 * moment it is saved; a rejected run tells whoever approves results, because
 * patient results from that run should not go out until it is resolved.
 */
export const qcService = {
  async listMaterials(includeInactive = false) {
    const rows = await (await tenantDb()).qcMaterial.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { level: 'asc' }],
      include: {
        parameter: { select: { name: true, unit: true, test: { select: { name: true } } } },
        runs: { orderBy: { runAt: 'desc' }, take: 1, select: { value: true, runAt: true, rejected: true, violations: true } },
        _count: { select: { runs: true } },
      },
    });
    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      level: m.level,
      lotNo: m.lotNo,
      mean: Number(m.mean),
      sd: Number(m.sd),
      expiresAt: m.expiresAt?.toISOString() ?? null,
      isActive: m.isActive,
      parameter: m.parameter.name,
      unit: m.parameter.unit,
      test: m.parameter.test.name,
      runs: m._count.runs,
      lastRun: m.runs[0]
        ? { value: Number(m.runs[0].value), at: m.runs[0].runAt.toISOString(), rejected: m.runs[0].rejected, violations: m.runs[0].violations }
        : null,
    }));
  },

  /** Parameters a control can be run for: numbers, measured or calculated. */
  async numericParameters() {
    const rows = await (await tenantDb()).testParameter.findMany({
      where: { valueType: { in: ['NUMBER', 'CALCULATED'] }, test: { isActive: true } },
      orderBy: [{ test: { name: 'asc' } }, { sortOrder: 'asc' }],
      select: { id: true, name: true, unit: true, test: { select: { name: true } } },
    });
    return rows.map((p) => ({ id: p.id, name: p.name, unit: p.unit, test: p.test.name }));
  },

  async createMaterial(input: { parameterId: string; name: string; level: string; lotNo?: string; mean: number; sd: number; expiresAt?: Date }) {
    if (!(input.sd > 0)) throw new QcError('The SD must be greater than zero.');
    const db = await tenantDb();
    const param = await db.testParameter.findUnique({ where: { id: input.parameterId }, select: { id: true } });
    if (!param) throw new QcError('Choose the parameter this control is for.');
    const row = await db.qcMaterial.create({
      data: { tenantId: await currentTenantId(), ...input, lotNo: input.lotNo ?? null, expiresAt: input.expiresAt ?? null },
      select: { id: true },
    });
    return row.id;
  },

  async setActive(id: string, isActive: boolean) {
    await (await tenantDb()).qcMaterial.update({ where: { id }, data: { isActive } });
  },

  async runs(materialId: string) {
    const rows = await (await tenantDb()).qcRun.findMany({
      where: { materialId },
      orderBy: { runAt: 'desc' },
      take: 60,
      select: { id: true, value: true, runAt: true, violations: true, rejected: true, note: true, enteredById: true },
    });
    const db = await tenantDb();
    const ids = [...new Set(rows.map((r) => r.enteredById))];
    const users = new Map((ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : []).map((u) => [u.id, u.fullName]));
    return rows.reverse().map((r) => ({
      id: r.id, value: Number(r.value), at: r.runAt.toISOString(), violations: r.violations, rejected: r.rejected, note: r.note, by: users.get(r.enteredById) ?? null,
    }));
  },

  async recordRun(materialId: string, value: number, note: string | undefined, userId: string) {
    const db = await tenantDb();
    const material = await db.qcMaterial.findUnique({
      where: { id: materialId },
      select: { id: true, name: true, level: true, mean: true, sd: true, isActive: true, parameter: { select: { name: true } } },
    });
    if (!material || !material.isActive) throw new QcError('That control is not in use.');
    // Earlier accepted runs form the history the multi-run rules look back over.
    const earlier = await db.qcRun.findMany({
      where: { materialId, rejected: false },
      orderBy: { runAt: 'desc' },
      take: 9,
      select: { value: true },
    });
    const result = westgard([...earlier.reverse().map((r) => Number(r.value)), value], Number(material.mean), Number(material.sd));
    const violations = [...result.rejections, ...result.warnings];
    const rejected = result.rejections.length > 0;
    await db.qcRun.create({
      data: {
        tenantId: await currentTenantId(), materialId, value, enteredById: userId,
        violations: violations.length ? violations.join(',') : null, rejected, note: note ?? null,
      },
    });
    if (rejected) {
      await notifyStaff(
        ['qc.manage', 'result.approve'],
        { key: 'notify.qcRejected', params: { control: `${material.name} ${material.level}`, parameter: material.parameter.name, rules: result.rejections.join(', ') } },
        { link: `/lab/qc?m=${materialId}`, kind: 'CRITICAL', excludeUserId: userId },
      );
    }
    return { ...result, rejected };
  },
};
