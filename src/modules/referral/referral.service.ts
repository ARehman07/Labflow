import { tenantDb, currentTenantId } from '@/core/db/context';

export interface DoctorCommission {
  doctorId: string;
  name: string;
  clinic: string | null;
  commissionPct: number;
  visits: number;
  accrued: number; // pending payout
  paid: number;
}

export interface PartnerLabRow {
  id: string;
  name: string;
  direction: string;
  phone: string | null;
}

export const referralService = {
  async doctorCommissions(branchId: string): Promise<DoctorCommission[]> {
    const commissions = await (await tenantDb()).commission.findMany({
      where: { visit: { branchId } },
      include: { doctor: true },
    });

    const map = new Map<string, DoctorCommission>();
    const seenVisits = new Map<string, Set<string>>();
    for (const c of commissions) {
      const key = c.doctorId;
      if (!map.has(key)) {
        map.set(key, {
          doctorId: c.doctorId,
          name: c.doctor.name,
          clinic: c.doctor.clinic,
          commissionPct: Number(c.doctor.commissionPct),
          visits: 0,
          accrued: 0,
          paid: 0,
        });
      }
      const row = map.get(key)!;
      if (!seenVisits.has(key)) seenVisits.set(key, new Set());
      seenVisits.get(key)!.add(c.visitId);
      row.visits = seenVisits.get(key)!.size;
      if (c.status === 'PAID') row.paid += Number(c.amount);
      else row.accrued += Number(c.amount);
    }
    return [...map.values()].sort((a, b) => b.accrued - a.accrued);
  },

  /**
   * Settle everything currently accrued for a doctor.
   *
   * `expected` is what the operator saw on screen when they clicked. Commission
   * accrues on every payment, so the figure can move between page load and
   * click; settling blind would silently write off the difference. If it has
   * moved we refuse and hand back the real number to confirm against.
   */
  async settleDoctor(doctorId: string, branchId: string, expected: number) {
    const db = await tenantDb();
    const rows = await db.commission.findMany({
      where: { doctorId, status: 'ACCRUED', visit: { branchId } },
      select: { id: true, amount: true },
    });
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);

    if (total <= 0) return { ok: false as const, reason: 'NOTHING_OWED' as const, total };
    if (Math.abs(total - expected) > 0.5) {
      return { ok: false as const, reason: 'AMOUNT_CHANGED' as const, total };
    }

    await db.commission.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { status: 'PAID' },
    });
    return { ok: true as const, settled: total };
  },

  async listPartnerLabs(): Promise<PartnerLabRow[]> {
    const labs = await (await tenantDb()).partnerLab.findMany({ orderBy: { name: 'asc' } });
    return labs.map((l) => ({ id: l.id, name: l.name, direction: l.direction, phone: l.phone }));
  },

  async createPartnerLab(input: { name: string; direction: 'INWARD' | 'OUTWARD'; phone?: string }) {
    return (await tenantDb()).partnerLab.create({
      data: { tenantId: await currentTenantId(), name: input.name, direction: input.direction, phone: input.phone ?? null },
    });
  },
};
