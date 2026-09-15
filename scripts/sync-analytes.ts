/**
 * Fill in analyte codes for parameters that have none, from their names.
 *
 * Deliberately ADDITIVE, like sync-permissions. A code already set — by an
 * earlier run or typed in the test editor — is never changed, and a name that
 * is not recognised stays blank rather than being guessed (see
 * src/modules/catalog/analyte-suggest.ts). Safe to run on every deploy.
 *
 * A failure here is reported and the deploy carries on: a missing analyte code
 * only means report history matches one test at a time, which is no reason to
 * hold back a release.
 *
 * Run with: npm run db:sync-analytes
 */
import { PrismaClient } from '@prisma/client';
import { suggestAnalyte } from '../src/modules/catalog/analyte-suggest';

const prisma = new PrismaClient();

async function main() {
  const params = await prisma.testParameter.findMany({
    where: { analyteCode: null },
    select: { id: true, name: true, code: true, test: { select: { name: true } }, tenant: { select: { code: true } } },
    orderBy: [{ tenantId: 'asc' }, { testId: 'asc' }, { sortOrder: 'asc' }],
  });

  let filled = 0;
  for (const p of params) {
    const code = suggestAnalyte(p);
    if (!code) continue;
    // Guarded on "still blank", so a code someone saves mid-deploy is not overwritten.
    const res = await prisma.testParameter.updateMany({ where: { id: p.id, analyteCode: null }, data: { analyteCode: code } });
    if (res.count > 0) {
      filled += 1;
      console.log(`  ${p.tenant.code} · ${p.test.name} / ${p.name} → ${code}`);
    }
  }
  console.log(`analyte codes: ${filled} filled, ${params.length - filled} left blank (name not recognised)`);
}

main()
  .catch((e) => { console.warn('analyte codes not synced:', e instanceof Error ? e.message : e); })
  .finally(() => prisma.$disconnect());
