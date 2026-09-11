import { tenantDb, currentTenantId } from '@/core/db/context';

/** A common panel to start from; the lab edits it in Admin. */
const DEFAULT_PANEL = [
  'Amikacin', 'Amoxicillin/Clavulanate', 'Ampicillin', 'Azithromycin', 'Cefepime', 'Cefixime',
  'Ceftazidime', 'Ceftriaxone', 'Ciprofloxacin', 'Clindamycin', 'Colistin', 'Co-trimoxazole',
  'Doxycycline', 'Erythromycin', 'Fosfomycin', 'Gentamicin', 'Imipenem', 'Levofloxacin',
  'Linezolid', 'Meropenem', 'Nitrofurantoin', 'Piperacillin/Tazobactam', 'Tigecycline', 'Vancomycin',
];

export const antibioticsService = {
  /** The lab's antibiotics in panel order. A lab with none gets the common panel. */
  async list(includeInactive = false) {
    const db = await tenantDb();
    if ((await db.antibiotic.count()) === 0) {
      const tenantId = await currentTenantId();
      for (const [i, name] of DEFAULT_PANEL.entries()) {
        await db.antibiotic.create({ data: { tenantId, name, sortOrder: i } });
      }
    }
    return db.antibiotic.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true },
    });
  },

  async add(name: string) {
    const db = await tenantDb();
    if (await db.antibiotic.findFirst({ where: { name }, select: { id: true } })) {
      throw new Error(`"${name}" is already on the panel.`);
    }
    const last = await db.antibiotic.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    await db.antibiotic.create({ data: { tenantId: await currentTenantId(), name, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  },

  async setActive(id: string, isActive: boolean) {
    await (await tenantDb()).antibiotic.update({ where: { id }, data: { isActive } });
  },
};
