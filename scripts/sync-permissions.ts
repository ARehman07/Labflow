/**
 * Bring an existing database in line with the permission catalogue.
 *
 * Deliberately ADDITIVE. The seed wipes a role's grants and rewrites them from
 * DEFAULT_ROLES, which is right for a brand-new tenant and wrong for a live
 * one — a lab that has tuned its own roles in admin would silently lose that
 * work the next time a permission was added. This only ever creates: missing
 * permissions, missing roles, and grants a role's defaults say it should have.
 * It never revokes.
 *
 * Run with: npm run db:sync-perms
 */
import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, DEFAULT_ROLES } from '../src/core/rbac/permissions';

const prisma = new PrismaClient();

async function main() {
  let created = 0;
  for (const p of ALL_PERMISSIONS) {
    const before = await prisma.permission.findUnique({ where: { code: p.code } });
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { label: p.label },
      create: { code: p.code, label: p.label },
    });
    if (!before) { created += 1; console.log(`  + permission ${p.code}`); }
  }
  console.log(`permissions: ${ALL_PERMISSIONS.length} in catalogue, ${created} new`);

  const tenants = await prisma.tenant.findMany({ select: { id: true, code: true } });
  for (const tenant of tenants) {
    console.log(`\ntenant ${tenant.code}`);
    for (const [roleName, codes] of Object.entries(DEFAULT_ROLES)) {
      const role = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: roleName } },
        update: {},
        create: { tenantId: tenant.id, name: roleName },
      });
      const want = await prisma.permission.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
      const have = new Set(
        (await prisma.rolePermission.findMany({ where: { roleId: role.id }, select: { permissionId: true } }))
          .map((r) => r.permissionId),
      );
      const missing = want.filter((p) => !have.has(p.id));
      if (missing.length > 0) {
        await prisma.rolePermission.createMany({
          data: missing.map((p) => ({ roleId: role.id, permissionId: p.id })),
        });
        console.log(`  ${roleName}: +${missing.length} (${missing.map((m) => m.code).join(', ')})`);
      } else {
        console.log(`  ${roleName}: up to date`);
      }
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
