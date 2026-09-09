import { tenantDb, currentTenantId } from '@/core/db/context';
import { computeInvoiceTotals } from '@/modules/billing/discount';
import { familyCardService } from '@/modules/familycard/familycard.service';
import { formatMrNo, formatSlipNo } from '@/lib/ids';
import { priceTests } from '@/modules/catalog/catalog.service';
import { receptionRepository } from './reception.repository';
import type { PatientCreateInput, BookVisitInput } from './reception.schema';

export const receptionService = {
  async searchPatients(query: string) {
    return receptionRepository.searchPatients(query);
  },

  async listDoctors() {
    return receptionRepository.listDoctors();
  },

  async createPatient(input: PatientCreateInput) {
    const seq = (await receptionRepository.countPatients()) + 1;
    return (await tenantDb()).patient.create({
      data: { tenantId: await currentTenantId(),
        mrNo: formatMrNo(seq),
        fullName: input.fullName,
        age: input.age ?? null,
        sex: input.sex ?? null,
        mobile: input.mobile ?? null,
        address: input.address ?? null,
      },
    });
  },

  /** Create a visit with its order lines + invoice in one transaction.
   *  Prices are resolved server-side — never trusted from the client. */
  async bookVisit(
    input: BookVisitInput,
    ctx: { userId: string; branchId: string },
  ): Promise<{ visitId: string }> {
    const priceMap = await priceTests(ctx.branchId, input.testIds);

    // Validate every requested test exists & is priceable.
    for (const id of input.testIds) {
      if (!priceMap.has(id)) throw new Error('One or more selected tests are invalid.');
    }

    const gross = input.testIds.reduce((sum, id) => sum + (priceMap.get(id)?.price ?? 0), 0);

    // Discount policy is resolved on the SERVER, from lab configuration —
    // never from what the browser sent. A card holder gets the card rate; a
    // manual entry is discarded rather than added. See modules/billing/discount.
    const existingCard = await familyCardService.findForPatient(input.patientId);
    const tenant = await (await tenantDb()).tenant.findUniqueOrThrow({
      where: { id: await currentTenantId() },
      select: {
        familyCardDiscountPct: true,
        familyCardMemberCap: true,
        familyCardFee: true,
        familyCardDiscountOnIssue: true,
      },
    });

    // A card may already cover this patient, be joined from a relative's
    // number, or be created here. Only creating one charges the joining fee —
    // joining a family member's card costs nothing, it is already paid for.
    const joiningCard =
      !existingCard && input.familyCardMode === 'JOIN' && input.familyCardMobile
        ? await familyCardService.findJoinable(input.familyCardMobile, input.patientId)
        : null;

    if (!existingCard && input.familyCardMode === 'JOIN' && !joiningCard) {
      throw new Error('That family card cannot be used — check the number, or it may be full.');
    }

    const issuingCard = input.familyCardMode === 'CREATE' && !existingCard && !joiningCard;
    const cardFee = issuingCard ? Number(tenant.familyCardFee) : 0;

    const effectivePct = existingCard
      ? Number(existingCard.discountPct)
      : joiningCard
        ? Number(joiningCard.discountPct)
        : issuingCard && tenant.familyCardDiscountOnIssue
          ? Number(tenant.familyCardDiscountPct)
          : null;

    const card = existingCard ?? joiningCard;
    const doctor = input.doctorId
      ? await (await tenantDb()).doctor.findUnique({
          where: { id: input.doctorId },
          select: { patientDiscountPct: true },
        })
      : null;

    const totals = computeInvoiceTotals({
      gross,
      familyCardPct: effectivePct,
      doctorPct: doctor ? Number(doctor.patientDiscountPct) : null,
      manual:
        input.discountValue > 0
          ? { type: input.discountType, value: input.discountValue }
          : null,
      cardFee,
    });
    const discount = totals.discount;
    const net = totals.net;

    // Load TAT per test to compute due dates.
    const tests = await (await tenantDb()).test.findMany({
      where: { id: { in: input.testIds } },
      select: { id: true, tatHours: true },
    });
    const tatMap = new Map(tests.map((t) => [t.id, t.tatHours]));
    const now = new Date();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tenantId = await currentTenantId();

    return (await tenantDb()).$transaction(async (tx) => {
      const slipSeq = (await tx.visit.count({ where: { branchId: ctx.branchId } })) + 1;
      // Waiting-room token number resets daily per branch, and comes from the
      // tokens themselves so the number handed to the patient always matches
      // the queue board. See queueService.nextNumber.
      const lastToken = await tx.queueToken.findFirst({
        where: { at: { gte: todayStart }, visit: { branchId: ctx.branchId } },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const tokenNumber = (lastToken?.number ?? 0) + 1;

      // Nested writes are not reached by the isolation extension, so every
      // child carries tenantId explicitly. The NOT NULL column makes a miss a
      // hard failure rather than an orphan row.
      const visit = await tx.visit.create({
        data: {
          tenantId,
          slipNo: formatSlipNo(slipSeq),
          patientId: input.patientId,
          branchId: ctx.branchId,
          doctorId: input.doctorId ?? null,
          createdById: ctx.userId,
          orderLines: {
            create: input.testIds.map((testId) => ({
              tenantId,
              testId,
              status: 'BOOKED',
              dueAt: new Date(now.getTime() + (tatMap.get(testId) ?? 24) * 3600_000),
            })),
          },
          invoice: {
            create: {
              tenantId,
              grossAmount: gross,
              discountSource: totals.discountSource,
              familyCardId: card?.id ?? null,
              familyCardFee: totals.cardFee,
              discount,
              netAmount: net,
              paidAmount: 0,
              status: 'DUE',
            },
          },
          token: {
            create: { tenantId, number: tokenNumber, status: 'WAITING' },
          },
        },
      });

      // Joining is recorded with the slip, so the discount on this bill and
      // the membership that justifies it are written together or not at all.
      if (joiningCard) {
        await tx.familyCardMember.create({
          data: {
            tenantId,
            cardId: joiningCard.id,
            patientId: input.patientId,
            relation: input.familyCardRelation,
          },
        });
      }

      // The card is created in the same transaction as the slip that pays for
      // it: no card without its fee, no fee without its card.
      if (issuingCard) {
        const mobile =
          input.familyCardMobile ??
          (await tx.patient.findUniqueOrThrow({
            where: { id: input.patientId },
            select: { mobile: true },
          })).mobile;

        if (!mobile) {
          throw new Error('A mobile number is required to issue a family card.');
        }

        const clash = await tx.familyCard.findUnique({
          where: { tenantId_mobile: { tenantId, mobile } },
        });
        if (clash) throw new Error('A family card already exists for that mobile number.');

        const newCard = await tx.familyCard.create({
          data: {
            tenantId,
            mobile,
            primaryPatientId: input.patientId,
            discountPct: tenant.familyCardDiscountPct,
            memberCap: tenant.familyCardMemberCap,
            feeAmount: tenant.familyCardFee,
            issuedById: ctx.userId,
          },
        });
        // The holder is SELF, matching familyCardService.issue(). Without
        // this the booking path left the holder as OTHER, so the same card
        // looked different depending on where it was created.
        await tx.familyCardMember.create({
          data: { tenantId, cardId: newCard.id, patientId: input.patientId, relation: 'SELF' },
        });
        await tx.invoice.update({
          where: { visitId: visit.id },
          data: { familyCardId: newCard.id },
        });
      }

      return { visitId: visit.id };
    });
  },

  async getSlip(visitId: string) {
    return receptionRepository.getVisitWithDetails(visitId);
  },
};
