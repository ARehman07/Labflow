import { tenantDb } from '@/core/db/context';

/** Data-access for the reception module. No business rules here. */
export const receptionRepository = {
  async searchPatients(query: string) {
    const q = query.trim();
    return (await tenantDb()).patient.findMany({
      where: q
        ? {
            OR: [
              { mrNo: { contains: q } },
              { fullName: { contains: q } },
              { mobile: { contains: q } },
            ],
          }
        : {},
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  },

  async countPatients() {
    return (await tenantDb()).patient.count();
  },

  async countVisitsForBranch(branchId: string) {
    return (await tenantDb()).visit.count({ where: { branchId } });
  },

  async listDoctors() {
    return (await tenantDb()).doctor.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  },

  async getVisitWithDetails(visitId: string) {
    return (await tenantDb()).visit.findUnique({
      where: { id: visitId },
      include: {
        patient: true,
        branch: { include: { tenant: { select: { name: true, tagline: true, logoDataUrl: true, licenseNo: true, email: true } } } },
        doctor: true,
        createdBy: true,
        orderLines: { include: { test: true } },
        invoice: true,
      },
    });
  },
};
