/**
 * Family-card membership rules (docs/09-requirements.md, R1).
 *
 * Kept free of database and session imports so each rule the owner specified
 * is directly testable, and so the same rules can be reused from a bulk import
 * or an admin tool later.
 */

/**
 * How a member relates to the card holder.
 *
 * Declared here rather than imported from Prisma: the SQLite dev schema has no
 * native enums (they are transformed to String by scripts/gen-sqlite-schema),
 * so `Relation` does not exist on the generated client locally. One list, used
 * by the UI, the service and the schema.
 */
export const RELATIONS = [
  'SELF', 'SPOUSE', 'SON', 'DAUGHTER', 'FATHER', 'MOTHER', 'BROTHER', 'SISTER', 'OTHER',
] as const;
export type Relation = (typeof RELATIONS)[number];

/** Everything except SELF, which only ever belongs to the card holder. */
export const MEMBER_RELATIONS = RELATIONS.filter((r) => r !== 'SELF');

export interface AddMemberContext {
  /** Total people the card may carry, INCLUDING the card holder. */
  memberCap: number;
  /** Active members already on this card, card holder included. */
  currentMemberCount: number;
  alreadyOnThisCard: boolean;
  /** The patient holds an active membership on a different card. */
  onAnotherCard: boolean;
  cardIsActive: boolean;
  expiresAt?: Date | null;
  now?: Date;
}

export type RuleResult = { ok: true } | { ok: false; reason: string };

export function canAddMember(ctx: AddMemberContext): RuleResult {
  const now = ctx.now ?? new Date();

  if (!ctx.cardIsActive) {
    return { ok: false, reason: 'This card is not active.' };
  }
  if (ctx.expiresAt && ctx.expiresAt < now) {
    return { ok: false, reason: 'This card has expired.' };
  }
  if (ctx.alreadyOnThisCard) {
    return { ok: false, reason: 'That patient is already on this card.' };
  }
  // Two active cards would mean two rates for one person. Refuse rather than
  // silently pick one.
  if (ctx.onAnotherCard) {
    return { ok: false, reason: 'That patient already belongs to another family card.' };
  }
  if (ctx.currentMemberCount >= ctx.memberCap) {
    return {
      ok: false,
      reason: `This card is full (${ctx.memberCap} members, including the card holder).`,
    };
  }
  return { ok: true };
}

/**
 * Membership is permanent by design.
 *
 * Removal used to free the slot, which made the six-member cap meaningless: a
 * card holder could rotate people through the card indefinitely and everyone
 * got the discount. Since the cap IS the product, and nothing else limits who
 * benefits, the only rule that holds is that a slot, once used, stays used.
 *
 * The cost is that a mis-added member cannot be undone — which is why the UI
 * warns before adding rather than offering a fix afterwards. If corrections
 * are ever needed, the safe form is an admin-only reversal that does NOT free
 * the slot; freeing it reopens the loophole.
 */

/** A card only discounts while it is active and unexpired. */
export function cardIsUsable(
  card: { isActive: boolean; expiresAt?: Date | null },
  now: Date = new Date(),
): boolean {
  if (!card.isActive) return false;
  if (card.expiresAt && card.expiresAt < now) return false;
  return true;
}
