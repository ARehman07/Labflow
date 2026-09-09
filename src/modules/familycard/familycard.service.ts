import { tenantDb, currentTenantId } from '@/core/db/context';
import { canAddMember, cardIsUsable, type Relation } from './familycard.rules';

/**
 * Family cards (docs/09-requirements.md, R1).
 *
 * The mobile number is the card — there is no separate card number, so nothing
 * can be lost or mistyped. The rate and the member cap are snapshotted at issue
 * so that changing lab policy later does not silently rewrite what existing
 * holders were promised.
 */
export const familyCardService = {
  /** The active card covering this patient, if any. Used at booking. */
  async findForPatient(patientId: string) {
    const db = await tenantDb();
    const membership = await db.familyCardMember.findFirst({
      where: { patientId, removedAt: null, card: { isActive: true } },
      include: { card: true },
    });
    if (!membership) return null;

    const card = membership.card;
    return cardIsUsable(card) ? card : null;
  },

  async findByMobile(mobile: string) {
    const db = await tenantDb();
    return db.familyCard.findUnique({
      where: { tenantId_mobile: { tenantId: await currentTenantId(), mobile } },
      include: {
        primaryPatient: { select: { id: true, fullName: true, mrNo: true } },
        members: {
          where: { removedAt: null },
          include: { patient: { select: { id: true, fullName: true, mrNo: true, age: true, sex: true } } },
          orderBy: { addedAt: 'asc' },
        },
      },
    });
  },

  /**
   * Issue a card against a mobile number, with the primary holder as its first
   * member. Rate and cap come from lab policy, not from the caller — reception
   * cannot invent a discount.
   */
  async issue(
    mobile: string,
    primaryPatientId: string,
    issuedById: string,
    branchId: string,
  ) {
    const tenantId = await currentTenantId();
    const db = await tenantDb();

    const existing = await db.familyCard.findUnique({
      where: { tenantId_mobile: { tenantId, mobile } },
    });
    if (existing) throw new Error('A family card already exists for this mobile number.');

    const onAnotherCard = await db.familyCardMember.findFirst({
      where: { patientId: primaryPatientId, removedAt: null, card: { isActive: true } },
    });
    if (onAnotherCard) {
      throw new Error('That patient already belongs to another family card.');
    }

    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        familyCardDiscountPct: true,
        familyCardMemberCap: true,
        familyCardFee: true,
      },
    });
    const fee = Number(tenant.familyCardFee);

    return db.$transaction(async (tx) => {
      const card = await tx.familyCard.create({
        data: {
          tenantId,
          mobile,
          primaryPatientId,
          discountPct: tenant.familyCardDiscountPct,
          memberCap: tenant.familyCardMemberCap,
          feeAmount: tenant.familyCardFee,
          issuedById,
        },
      });
      // The primary holder occupies one of the slots — the cap is the total.
      await tx.familyCardMember.create({
        data: { tenantId, cardId: card.id, patientId: primaryPatientId, relation: 'SELF' },
      });

      // Issued outside a booking, so there is no invoice to carry the joining
      // fee. Post it to the day's ledger instead — a card must never be free
      // just because of the screen it was created from.
      if (fee > 0) {
        await tx.ledgerEntry.create({
          data: {
            tenantId,
            branchId,
            type: 'INCOME',
            category: 'Family Card Fee',
            amount: fee,
            note: `Family card issued for ${mobile}`,
          },
        });
      }

      return card;
    });
  },

  /** Add a family member. Refuses once the card is full. */
  async addMember(cardId: string, patientId: string, relation: Relation = 'OTHER') {
    const tenantId = await currentTenantId();
    const db = await tenantDb();

    const card = await db.familyCard.findUniqueOrThrow({
      where: { id: cardId },
      include: { members: { where: { removedAt: null } } },
    });

    const elsewhere = await db.familyCardMember.findFirst({
      where: { patientId, removedAt: null, cardId: { not: cardId }, card: { isActive: true } },
    });

    const verdict = canAddMember({
      memberCap: card.memberCap,
      currentMemberCount: card.members.length,
      alreadyOnThisCard: card.members.some((m) => m.patientId === patientId),
      onAnotherCard: Boolean(elsewhere),
      cardIsActive: card.isActive,
      expiresAt: card.expiresAt,
    });
    if (!verdict.ok) throw new Error(verdict.reason);

    return db.familyCardMember.create({ data: { tenantId, cardId, patientId, relation } });
  },

  async setActive(cardId: string, isActive: boolean) {
    return (await tenantDb()).familyCard.update({ where: { id: cardId }, data: { isActive } });
  },

  /**
   * The card held on `mobile`, if `patientId` may join it.
   *
   * Returns null rather than throwing: the caller is a lookup, and "no" is a
   * normal answer. All the membership rules apply — full cards, expired cards,
   * and people already on another card are all refused here rather than at
   * write time.
   */
  async findJoinable(mobile: string, patientId: string) {
    const tenantId = await currentTenantId();
    const db = await tenantDb();

    const card = await db.familyCard.findUnique({
      where: { tenantId_mobile: { tenantId, mobile } },
      include: { members: { where: { removedAt: null } } },
    });
    if (!card) return null;

    const elsewhere = await db.familyCardMember.findFirst({
      where: { patientId, removedAt: null, cardId: { not: card.id }, card: { isActive: true } },
    });

    const verdict = canAddMember({
      memberCap: card.memberCap,
      currentMemberCount: card.members.length,
      alreadyOnThisCard: card.members.some((m) => m.patientId === patientId),
      onAnotherCard: Boolean(elsewhere),
      cardIsActive: card.isActive,
      expiresAt: card.expiresAt,
    });
    return verdict.ok ? card : null;
  },

  /** Everything reception needs to decide, in one call. */
  async describeForBooking(mobile: string, patientId: string) {
    const tenantId = await currentTenantId();
    const db = await tenantDb();

    const card = await db.familyCard.findUnique({
      where: { tenantId_mobile: { tenantId, mobile } },
      include: {
        primaryPatient: { select: { fullName: true } },
        members: { where: { removedAt: null } },
      },
    });
    if (!card) return { found: false as const };

    const elsewhere = await db.familyCardMember.findFirst({
      where: { patientId, removedAt: null, cardId: { not: card.id }, card: { isActive: true } },
    });
    const verdict = canAddMember({
      memberCap: card.memberCap,
      currentMemberCount: card.members.length,
      alreadyOnThisCard: card.members.some((m) => m.patientId === patientId),
      onAnotherCard: Boolean(elsewhere),
      cardIsActive: card.isActive,
      expiresAt: card.expiresAt,
    });

    return {
      found: true as const,
      holderName: card.primaryPatient.fullName,
      discountPct: Number(card.discountPct),
      used: card.members.length,
      cap: card.memberCap,
      canJoin: verdict.ok,
      reason: verdict.ok ? null : verdict.reason,
    };
  },

  /** The lab's card policy, as reception needs it to price a slip. */
  async policy(): Promise<{ fee: number; discountPct: number; discountOnIssue: boolean }> {
    const t = await (await tenantDb()).tenant.findUniqueOrThrow({
      where: { id: await currentTenantId() },
      select: {
        familyCardFee: true,
        familyCardDiscountPct: true,
        familyCardDiscountOnIssue: true,
      },
    });
    return {
      fee: Number(t.familyCardFee),
      discountPct: Number(t.familyCardDiscountPct),
      discountOnIssue: t.familyCardDiscountOnIssue,
    };
  },

  /** Recently issued cards, optionally narrowed by number or holder name. */
  async list(query?: string) {
    const q = query?.trim();
    return (await tenantDb()).familyCard.findMany({
      where: q
        ? {
            OR: [
              { mobile: { contains: q } },
              { primaryPatient: { fullName: { contains: q } } },
              { primaryPatient: { mrNo: { contains: q } } },
            ],
          }
        : undefined,
      include: {
        primaryPatient: { select: { fullName: true, mrNo: true } },
        members: { where: { removedAt: null }, select: { id: true } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 50,
    });
  },
};
