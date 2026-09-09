'use server';

import { requirePermission } from '@/core/rbac/guard';
import { familyCardService } from './familycard.service';
import type { Relation } from './familycard.rules';

export interface FamilyCardMemberDTO {
  memberId: string;
  patientId: string;
  fullName: string;
  mrNo: string;
  isPrimary: boolean;
  relation: Relation;
}

export interface FamilyCardDTO {
  id: string;
  mobile: string;
  discountPct: number;
  memberCap: number;
  isActive: boolean;
  primaryName: string;
  members: FamilyCardMemberDTO[];
  slotsLeft: number;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
}

export async function findCardByMobileAction(mobile: string): Promise<FamilyCardDTO | null> {
  await requirePermission('patient.manage');
  const card = await familyCardService.findByMobile(mobile.trim());
  if (!card) return null;

  return {
    id: card.id,
    mobile: card.mobile,
    discountPct: Number(card.discountPct),
    memberCap: card.memberCap,
    isActive: card.isActive,
    primaryName: card.primaryPatient.fullName,
    members: card.members.map((m) => ({
      memberId: m.id,
      patientId: m.patientId,
      fullName: m.patient.fullName,
      mrNo: m.patient.mrNo,
      isPrimary: m.patientId === card.primaryPatientId,
      relation: m.relation as Relation,
    })),
    slotsLeft: Math.max(0, card.memberCap - card.members.length),
  };
}

export async function issueCardAction(
  mobile: string,
  primaryPatientId: string,
): Promise<Result<{ cardId: string; fee: number }>> {
  const user = await requirePermission('patient.manage');
  if (!/^0\d{10}$/u.test(mobile.trim())) {
    return { ok: false, error: 'Enter a valid 11-digit mobile (e.g. 03001234567).' };
  }
  if (!user.branchId) {
    return { ok: false, error: 'Your account has no branch, so the card fee cannot be posted.' };
  }
  try {
    const card = await familyCardService.issue(
      mobile.trim(),
      primaryPatientId,
      user.id,
      user.branchId,
    );
    return { ok: true, data: { cardId: card.id, fee: Number(card.feeAmount) } };
  } catch (e) {
    return fail(e);
  }
}

/** The lab's card policy: fee, rate, and whether the rate applies on day one. */
export async function getCardPolicyAction(): Promise<{
  fee: number;
  discountPct: number;
  discountOnIssue: boolean;
}> {
  await requirePermission('visit.create');
  return familyCardService.policy();
}

export async function addCardMemberAction(
  cardId: string,
  patientId: string,
  relation: Relation = 'OTHER',
): Promise<Result<null>> {
  await requirePermission('patient.manage');
  try {
    await familyCardService.addMember(cardId, patientId, relation);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/** Shown on the booking screen so reception can see the rate before charging. */
export async function getCardForPatientAction(
  patientId: string,
): Promise<{ discountPct: number; mobile: string } | null> {
  await requirePermission('visit.create');
  const card = await familyCardService.findForPatient(patientId);
  return card ? { discountPct: Number(card.discountPct), mobile: card.mobile } : null;
}

export interface BookingCardInfo {
  found: boolean;
  holderName?: string;
  discountPct?: number;
  used?: number;
  cap?: number;
  canJoin?: boolean;
  reason?: string | null;
}

/** Look up a card by mobile while booking, to join this patient to it. */
export async function describeCardForBookingAction(
  mobile: string,
  patientId: string,
): Promise<BookingCardInfo> {
  await requirePermission('visit.create');
  if (!/^0\d{10}$/u.test(mobile.trim())) return { found: false };
  return familyCardService.describeForBooking(mobile.trim(), patientId);
}

/** The card already covering this patient, if any. */
export async function currentCardForPatientAction(
  patientId: string,
): Promise<{ discountPct: number; mobile: string } | null> {
  await requirePermission('visit.create');
  const card = await familyCardService.findForPatient(patientId);
  return card ? { discountPct: Number(card.discountPct), mobile: card.mobile } : null;
}

export interface CardSummaryDTO {
  id: string;
  mobile: string;
  holderName: string;
  holderMrNo: string;
  discountPct: number;
  used: number;
  cap: number;
  isActive: boolean;
  issuedAt: string;
}

/** The card register: what exists, who holds it, how full it is. */
export async function listCardsAction(query?: string): Promise<CardSummaryDTO[]> {
  await requirePermission('patient.manage');
  const cards = await familyCardService.list(query);
  return cards.map((c) => ({
    id: c.id,
    mobile: c.mobile,
    holderName: c.primaryPatient.fullName,
    holderMrNo: c.primaryPatient.mrNo,
    discountPct: Number(c.discountPct),
    used: c.members.length,
    cap: c.memberCap,
    isActive: c.isActive,
    issuedAt: c.issuedAt.toISOString(),
  }));
}

/**
 * Any card reachable from a number, whoever holds it.
 *
 * Reception types a relative's number and expects the screen to react. This
 * answers "is there a card on this number, and can this patient use it?" in
 * one call, so the booking screen can offer to join without being asked.
 */
export async function cardOnNumberAction(
  mobile: string,
  patientId: string,
): Promise<BookingCardInfo> {
  await requirePermission('visit.create');
  if (!/^0\d{10}$/u.test(mobile.trim())) return { found: false };
  return familyCardService.describeForBooking(mobile.trim(), patientId);
}
