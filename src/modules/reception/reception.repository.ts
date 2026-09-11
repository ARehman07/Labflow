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
              ...(/^[\d-]{5,15}$/u.test(q) ? [{ cnic: { contains: q.replace(/-/g, '') } }] : []),
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
        branch: { include: { tenant: { select: { code: true, name: true, tagline: true, logoDataUrl: true, licenseNo: true, email: true } } } },
        doctor: true,
        createdBy: true,
        orderLines: { include: { test: true, package: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
        collectionPoint: { select: { name: true } },
        rateGroup: { select: { name: true } },
        // The authoriser is printed on the slip, so a care-of discount is
        // answerable from the paper the patient walks out with.
        invoice: {
          include: {
            careOfUser: { select: { fullName: true } },
            familyCard: { select: { discountPct: true } },
            payments: { select: { method: true } },
          },
        },
        token: { select: { number: true } },
      },
    });
  },
};
