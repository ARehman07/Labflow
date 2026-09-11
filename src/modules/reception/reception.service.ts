import { tenantDb, currentTenantId } from '@/core/db/context';
import { computeInvoiceTotals } from '@/modules/billing/discount';
import { familyCardService } from '@/modules/familycard/familycard.service';
import { formatMrNo, formatSlipNo } from '@/lib/ids';
import { priceTests } from '@/modules/catalog/catalog.service';
import { receptionRepository } from './reception.repository';
import type { PatientCreateInput, BookVisitInput } from './reception.schema';
import { statusFor } from '@/modules/billing/invoice-status';

import { ageFromDob } from '@/lib/age';
import { rebill } from '@/modules/billing/rebill';
import { spreadPackagePrice } from '@/modules/pricing/spread';
import { partnersService } from '@/modules/partners/partners.service';
import { labService } from '@/modules/lab/lab.service';

/** A refusal whose message is written for the counter and safe to show as-is. */
export class BookingEditError extends Error {}

/** Tests that can leave a booking: nothing has been drawn for them yet. */
const REMOVABLE: string[] = ['BOOKED', 'RETAKE'];

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const receptionService = {
  async searchPatients(query: string) {
    return receptionRepository.searchPatients(query);
  },

  async listDoctors() {
    return receptionRepository.listDoctors();
  },

  async createPatient(input: PatientCreateInput) {
    const seq = (await receptionRepository.countPatients()) + 1;
    // A date of birth is the better fact: age drifts, a birthday does not.
    // When both arrive, the age printed is the one the birthday gives.
    const fromDob = input.dateOfBirth ? ageFromDob(input.dateOfBirth) : null;
    return (await tenantDb()).patient.create({
      data: { tenantId: await currentTenantId(),
        mrNo: formatMrNo(seq),
        fullName: input.fullName,
        age: fromDob?.age ?? input.age ?? null,
        ageUnit: fromDob?.unit ?? input.ageUnit ?? 'YEARS',
        dateOfBirth: input.dateOfBirth ?? null,
        sex: input.sex ?? null,
        mobile: input.mobile ?? null,
        address: input.address ?? null,
        cnic: input.cnic ?? null,
        email: input.email ?? null,
        photoDataUrl: input.photoDataUrl ?? null,
      },
    });
  },

  /**
   * What this patient still owes from earlier visits. Shown when they are
   * booked again, so a balance is collected at the counter instead of being
   * found months later in Billing.
   */
  async outstandingFor(patientId: string, excludeVisitId?: string) {
    const invoices = await (await tenantDb()).invoice.findMany({
      where: {
        status: { in: ['DUE', 'PARTIAL'] },
        visit: {
          patientId,
          status: { not: 'CANCELLED' },
          ...(excludeVisitId ? { id: { not: excludeVisitId } } : {}),
          // A partner lab's account bookings are the partner's to pay, not the patient's.
          OR: [{ partnerLabId: null }, { partnerLab: { accountType: 'CASH' } }],
        },
      },
      select: { id: true, netAmount: true, paidAmount: true, visit: { select: { slipNo: true, bookedAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const rows = invoices
      .map((i) => ({ invoiceId: i.id, slipNo: i.visit.slipNo, bookedAt: i.visit.bookedAt, due: Math.max(0, Number(i.netAmount) - Number(i.paidAmount)) }))
      .filter((r) => r.due > 0);
    return { total: rows.reduce((s, r) => s + r.due, 0), invoices: rows };
  },

  /** Create a visit with its order lines + invoice in one transaction.
   *  Prices are resolved server-side — never trusted from the client. */
  async bookVisit(
    input: BookVisitInput,
    ctx: { userId: string; branchId: string },
  ): Promise<{ visitId: string }> {
    const db0 = await tenantDb();
    // A partner lab that sent the sample: its price list applies, and unless it
    // pays per booking in cash, the bill goes to its account, not the patient.
    const partner = input.partnerLabId
      ? await db0.partnerLab.findFirst({
          where: { id: input.partnerLabId, direction: 'INWARD', isActive: true },
          select: { id: true, accountType: true, rateGroupId: true },
        })
      : null;
    if (input.partnerLabId && !partner) throw new BookingEditError('That partner lab is not available.');
    const billedToPartner = partner != null && partner.accountType !== 'CASH';
    // A collection point brings its own price list; an explicit choice wins.
    const collectionPoint = input.collectionPointId
      ? await db0.collectionPoint.findFirst({ where: { id: input.collectionPointId, isActive: true }, select: { id: true, rateGroupId: true } })
      : null;
    if (input.collectionPointId && !collectionPoint) throw new BookingEditError('That collection point is not available.');
    const rateGroupId = input.rateGroupId ?? collectionPoint?.rateGroupId ?? partner?.rateGroupId ?? null;
    if (rateGroupId && !(await db0.rateGroup.findFirst({ where: { id: rateGroupId, isActive: true }, select: { id: true } }))) {
      throw new BookingEditError('That price list is not available.');
    }

    const wanted = [...new Set(input.packageIds)];
    const packages = wanted.length
      ? await db0.testPackage.findMany({ where: { id: { in: wanted }, isActive: true }, include: { items: { select: { testId: true } } } })
      : [];
    if (packages.length !== wanted.length) throw new BookingEditError('One or more selected packages are not available.');

    // A test that is in a package is charged through the package, never twice.
    const packageTestIds = new Set(packages.flatMap((p) => p.items.map((i) => i.testId)));
    const looseIds = [...new Set(input.testIds)].filter((id) => !packageTestIds.has(id));
    const allTestIds = [...new Set([...looseIds, ...packageTestIds])];
    if (allTestIds.length === 0) throw new BookingEditError('Add at least one test.');

    // Prices are resolved server-side — never trusted from the client.
    const priceMap = await priceTests(ctx.branchId, allTestIds, { rateGroupId });
    for (const id of allTestIds) {
      if (!priceMap.has(id)) throw new Error('One or more selected tests are invalid.');
    }
    const lines: { testId: string; price: number; packageId: string | null }[] =
      looseIds.map((id) => ({ testId: id, price: priceMap.get(id)!.price, packageId: null }));
    for (const pkg of packages) {
      // The same test in two packages is charged with the first.
      const ids = pkg.items.map((i) => i.testId).filter((id) => !lines.some((l) => l.testId === id));
      const shares = spreadPackagePrice(Number(pkg.price), ids.map((id) => priceMap.get(id)!.price));
      ids.forEach((id, i) => lines.push({ testId: id, price: shares[i], packageId: pkg.id }));
    }

    const gross = lines.reduce((sum, l) => sum + l.price, 0);

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
          select: { id: true, patientDiscountPct: true, commissionPct: true },
        })
      : null;


    const totals = computeInvoiceTotals({
      gross,
      familyCardPct: effectivePct,
      doctorPct: doctor ? Number(doctor.patientDiscountPct) : null,
      manual: input.manualDiscount ?? null,
      cardFee,
    });
    const discount = totals.discount;
    const net = totals.net;

    // Load TAT per test to compute due dates.
    const tests = await (await tenantDb()).test.findMany({
      where: { id: { in: allTestIds } },
      select: { id: true, tatHours: true },
    });
    const tatMap = new Map(tests.map((t) => [t.id, t.tatHours]));
    const now = new Date();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tenantId = await currentTenantId();

    const booked = await (await tenantDb()).$transaction(async (tx) => {
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
          notes: input.notes ?? null,
          sampleSource: input.sampleSource,
          reportDueAt: input.reportDueAt
            ?? new Date(now.getTime() + Math.max(...allTestIds.map((id) => tatMap.get(id) ?? 24)) * 3600_000),
          rateGroupId,
          collectionPointId: collectionPoint?.id ?? null,
          partnerLabId: partner?.id ?? null,
          b2bNo: input.b2bNo ?? null,
          createdById: ctx.userId,
          orderLines: {
            create: lines.map((l) => ({
              tenantId,
              testId: l.testId,
              price: l.price,
              packageId: l.packageId,
              bookingRemarks: input.testRemarks[l.testId] || null,
              status: 'BOOKED',
              dueAt: new Date(now.getTime() + (tatMap.get(l.testId) ?? 24) * 3600_000),
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

      // Payment taken at the counter is written with the slip, so a booking can
      // never exist "paid" without its payment row or the other way round.
      // Same rules as Billing: capped at the bill, invoice status recomputed,
      // and the referring doctor's commission accrued on what was received.
      if (input.payment && net > 0 && !billedToPartner) {
        const amount = Math.min(input.payment.amount, net);
        const invoiceRow = await tx.invoice.findUniqueOrThrow({ where: { visitId: visit.id }, select: { id: true } });
        const account = input.payment.accountId
          ? await tx.paymentAccount.findFirst({ where: { id: input.payment.accountId, isActive: true }, select: { id: true, method: true } })
          : null;
        await tx.payment.create({
          data: {
            tenantId, invoiceId: invoiceRow.id, amount,
            method: account?.method ?? input.payment.method,
            accountId: account?.id ?? null,
            receivedById: ctx.userId,
          },
        });
        await tx.invoice.update({
          where: { id: invoiceRow.id },
          data: { paidAmount: amount, status: statusFor(net, amount) },
        });
        if (doctor && Number(doctor.commissionPct) > 0) {
          const commission = (amount * Number(doctor.commissionPct)) / 100;
          if (commission > 0) {
            await tx.commission.create({
              data: { tenantId, doctorId: doctor.id, visitId: visit.id, amount: commission, status: 'ACCRUED' },
            });
          }
        }
        await tx.auditLog.create({
          data: {
            tenantId, actorId: ctx.userId, entity: 'Invoice', entityId: invoiceRow.id, action: 'PAYMENT',
            after: JSON.stringify({ amount, method: input.payment.method, paidAmount: amount, atBooking: true }),
          },
        });
      }

      return { visitId: visit.id };
    });
    // A prepaid partner's credit settles the new booking straight away.
    if (billedToPartner && partner) await partnersService.reconcile(partner.id);
    return booked;
  },

  /**
   * Patients who may be the person being registered: the same mobile number,
   * or the same name. Families share a number and names repeat, so this only
   * informs — it never blocks a registration.
   */
  async findSimilarPatients(input: { fullName?: string; mobile?: string }) {
    const name = (input.fullName ?? '').trim().replace(/\s+/g, ' ');
    const mobile = (input.mobile ?? '').trim();
    const byMobile = /^0\d{10}$/u.test(mobile);
    const first = name.split(' ')[0] ?? '';
    // contains is case-sensitive on Postgres, so the common spellings of the
    // first name are each tried; the exact comparison happens below.
    const variants = name.length >= 3
      ? [...new Set([first, first.toLowerCase(), first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()])]
      : [];
    if (!byMobile && variants.length === 0) return [];

    const rows = await (await tenantDb()).patient.findMany({
      where: {
        OR: [
          ...(byMobile ? [{ mobile }] : []),
          ...variants.map((v) => ({ fullName: { contains: v } })),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
    return rows
      .map((p) => ({
        patient: p,
        sameMobile: byMobile && p.mobile === mobile,
        sameName: name.length >= 3 && norm(p.fullName) === norm(name),
      }))
      .filter((m) => m.sameMobile || m.sameName)
      .sort((a, b) => Number(b.sameMobile && b.sameName) - Number(a.sameMobile && a.sameName))
      .slice(0, 5);
  },

  /** The tests on this patient's latest booking, at today's prices. */
  async lastVisitTests(patientId: string, branchId: string | null) {
    const visit = await (await tenantDb()).visit.findFirst({
      where: { patientId, status: { not: 'CANCELLED' } },
      orderBy: { bookedAt: 'desc' },
      select: {
        bookedAt: true,
        orderLines: { where: { status: { not: 'CANCELLED' } }, select: { testId: true } },
      },
    });
    if (!visit) return null;
    const ids = [...new Set(visit.orderLines.map((l) => l.testId))];
    const prices = await priceTests(branchId, ids);
    const tests = ids
      .filter((id) => prices.has(id))
      .map((id) => ({ id, name: prices.get(id)!.name, price: prices.get(id)!.price }));
    return tests.length > 0 ? { bookedAt: visit.bookedAt, tests } : null;
  },

  /** What this branch has booked most over the last 90 days. */
  async popularTests(branchId: string, limit = 8) {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const lines = await (await tenantDb()).orderLine.findMany({
      where: { createdAt: { gte: since }, status: { not: 'CANCELLED' }, visit: { branchId } },
      select: { testId: true },
      orderBy: { createdAt: 'desc' },
      take: 3000,
    });
    const counts = new Map<string, number>();
    for (const l of lines) counts.set(l.testId, (counts.get(l.testId) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, limit * 2);
    const prices = await priceTests(branchId, top);
    return top
      .filter((id) => prices.has(id))
      .slice(0, limit)
      .map((id) => ({ id, name: prices.get(id)!.name, price: prices.get(id)!.price }));
  },

  /**
   * Add a referring doctor from the counter. No commission and no patient
   * discount — those are money decisions, left to Admin. The same name typed
   * twice picks the existing doctor rather than creating a second.
   */
  async quickAddDoctor(input: { name: string; clinic?: string }) {
    const db = await tenantDb();
    const existing = await db.doctor.findFirst({
      where: { name: input.name, isActive: true },
      select: { id: true, name: true },
    });
    if (existing) return existing;
    return db.doctor.create({
      data: { tenantId: await currentTenantId(), name: input.name, clinic: input.clinic?.trim() || null },
      select: { id: true, name: true },
    });
  },

  /**
   * Add tests to a booking, or take off ones not yet drawn.
   *
   * The bill is re-worked on the discount basis it was booked with (see
   * billing/rebill). Money already taken is not touched: if the new total is
   * lower, the difference shows as a refund due, and Billing — which needs
   * its own permission — gives it back.
   */
  async modifyBooking(
    /** `notes` undefined leaves the comments as they are; null or '' clears them. */
    input: { visitId: string; addTestIds: string[]; removeLineIds: string[]; notes?: string | null },
    userId: string,
  ) {
    const db = await tenantDb();
    const visit = await db.visit.findUnique({
      where: { id: input.visitId },
      select: {
        id: true, status: true, branchId: true, notes: true, rateGroupId: true, partnerLabId: true,
        orderLines: { select: { id: true, testId: true, status: true, price: true } },
        invoice: {
          select: {
            id: true, grossAmount: true, discount: true, discountSource: true,
            familyCardFee: true, netAmount: true, paidAmount: true,
          },
        },
      },
    });
    if (!visit || !visit.invoice) throw new BookingEditError('Booking not found.');
    if (visit.status === 'CANCELLED') throw new BookingEditError('This booking has been cancelled.');

    const active = visit.orderLines.filter((l) => l.status !== 'CANCELLED');
    const removeIds = [...new Set(input.removeLineIds)];
    const removing = active.filter((l) => removeIds.includes(l.id));
    if (removing.length !== removeIds.length) throw new BookingEditError('That test is not on this booking.');
    if (removing.some((l) => !REMOVABLE.includes(l.status))) {
      throw new BookingEditError('A test whose sample has been taken cannot be removed.');
    }
    const kept = new Set(active.filter((l) => !removeIds.includes(l.id)).map((l) => l.testId));
    const addIds = [...new Set(input.addTestIds)];
    if (addIds.some((id) => kept.has(id))) throw new BookingEditError('That test is already on this booking.');
    const newNotes = input.notes === undefined ? undefined : (input.notes?.trim() || null);
    const notesChanged = newNotes !== undefined && newNotes !== (visit.notes ?? null);
    if (removing.length === 0 && addIds.length === 0) {
      if (!notesChanged) throw new BookingEditError('Nothing to change.');
      // Only the comments changed: nothing to re-price or re-queue.
      const tenantId = await currentTenantId();
      await db.$transaction(async (tx) => {
        await tx.visit.update({ where: { id: visit.id }, data: { notes: newNotes } });
        await tx.auditLog.create({
          data: {
            tenantId, actorId: userId, entity: 'Visit', entityId: visit.id, action: 'NOTES',
            before: JSON.stringify({ notes: visit.notes ?? null }),
            after: JSON.stringify({ notes: newNotes }),
          },
        });
      });
      return { net: Number(visit.invoice.netAmount), paid: Number(visit.invoice.paidAmount) };
    }
    if (kept.size + addIds.length === 0) {
      throw new BookingEditError('To remove every test, cancel the booking instead.');
    }

    const [addPrices, removePrices] = await Promise.all([
      priceTests(visit.branchId, addIds, { rateGroupId: visit.rateGroupId }),
      priceTests(visit.branchId, removing.map((l) => l.testId), { includeInactive: true }),
    ]);
    if (addIds.some((id) => !addPrices.has(id))) {
      throw new BookingEditError('One or more selected tests are invalid.');
    }

    const inv = visit.invoice;
    const oldGross = Number(inv.grossAmount);
    const totals = rebill({
      gross: oldGross,
      discount: Number(inv.discount),
      source: inv.discountSource,
      cardFee: Number(inv.familyCardFee),
      newGross: oldGross
        - removing.reduce((s, l) => s + (l.price != null ? Number(l.price) : (removePrices.get(l.testId)?.price ?? 0)), 0)
        + addIds.reduce((s, id) => s + (addPrices.get(id)?.price ?? 0), 0),
    });
    const paid = Number(inv.paidAmount);

    const tat = new Map(
      (addIds.length > 0
        ? await db.test.findMany({ where: { id: { in: addIds } }, select: { id: true, tatHours: true } })
        : []
      ).map((t) => [t.id, t.tatHours]),
    );
    const tenantId = await currentTenantId();
    const now = Date.now();

    await db.$transaction(async (tx) => {
      for (const l of removing) {
        await tx.orderLine.update({ where: { id: l.id }, data: { status: 'CANCELLED' } });
        await tx.workflowEvent.create({
          data: { tenantId, orderLineId: l.id, fromState: l.status, toState: 'CANCELLED', actorId: userId, note: 'Removed from booking' },
        });
      }
      for (const testId of addIds) {
        const line = await tx.orderLine.create({
          data: { tenantId, visitId: visit.id, testId, price: addPrices.get(testId)?.price ?? 0, status: 'BOOKED', dueAt: new Date(now + (tat.get(testId) ?? 24) * 3600_000) },
        });
        await tx.workflowEvent.create({
          data: { tenantId, orderLineId: line.id, fromState: null, toState: 'BOOKED', actorId: userId, note: 'Added to booking' },
        });
      }
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          grossAmount: totals.gross,
          discount: totals.discount,
          netAmount: totals.net,
          status: statusFor(totals.net, paid),
        },
      });

      if (notesChanged) {
        await tx.visit.update({ where: { id: visit.id }, data: { notes: newNotes } });
      }

      // The waiting-room token follows what is left to draw: a new test on a
      // finished visit re-opens it and puts the patient back in today's
      // queue; removing the last undrawn test closes the token.
      if (addIds.length > 0) {
        await tx.visit.updateMany({ where: { id: visit.id, status: 'COMPLETED' }, data: { status: 'OPEN' } });
        await tx.queueToken.updateMany({
          where: { visitId: visit.id, status: 'DONE', at: { gte: startOfToday() } },
          data: { status: 'WAITING' },
        });
      } else {
        const toDraw = await tx.orderLine.count({ where: { visitId: visit.id, status: { in: ['BOOKED', 'RETAKE'] } } });
        if (toDraw === 0) {
          await tx.queueToken.updateMany({ where: { visitId: visit.id, status: { not: 'DONE' } }, data: { status: 'DONE' } });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId, actorId: userId, entity: 'Visit', entityId: visit.id, action: 'MODIFY',
          before: JSON.stringify({ gross: oldGross, discount: Number(inv.discount), net: Number(inv.netAmount) }),
          after: JSON.stringify({
            added: addIds, removed: removing.map((l) => l.testId),
            ...(notesChanged ? { notes: newNotes } : {}),
            gross: totals.gross, discount: totals.discount, net: totals.net, paid,
          }),
        },
      });
    });
    await labService.completeVisitIfDone(visit.id);
    if (visit.partnerLabId) await partnersService.reconcile(visit.partnerLabId);
    return { net: totals.net, paid };
  },

  /**
   * Cancel a whole booking, while nothing on it has been drawn.
   *
   * Once a tube exists the lab has done work and holds a sample; that booking
   * is changed test by test instead. Any card joining fee stays on the bill —
   * the card was issued. Money already paid is left for Billing to refund.
   */
  async cancelBooking(visitId: string, reason: string | undefined, userId: string) {
    const db = await tenantDb();
    const visit = await db.visit.findUnique({
      where: { id: visitId },
      select: {
        id: true, status: true, partnerLabId: true,
        orderLines: { select: { id: true, status: true } },
        invoice: { select: { id: true, grossAmount: true, netAmount: true, familyCardFee: true, paidAmount: true } },
      },
    });
    if (!visit || !visit.invoice) throw new BookingEditError('Booking not found.');
    if (visit.status === 'CANCELLED') throw new BookingEditError('This booking has been cancelled.');
    const active = visit.orderLines.filter((l) => l.status !== 'CANCELLED');
    if (active.some((l) => !REMOVABLE.includes(l.status))) {
      throw new BookingEditError(
        'Samples have been taken for this booking, so it cannot be cancelled. Tests not yet drawn can still be removed.',
      );
    }

    const inv = visit.invoice;
    const paid = Number(inv.paidAmount);
    const net = Math.round(Number(inv.familyCardFee));
    const tenantId = await currentTenantId();

    await db.$transaction(async (tx) => {
      for (const l of active) {
        await tx.orderLine.update({ where: { id: l.id }, data: { status: 'CANCELLED' } });
        await tx.workflowEvent.create({
          data: { tenantId, orderLineId: l.id, fromState: l.status, toState: 'CANCELLED', actorId: userId, note: reason ? `Booking cancelled: ${reason}` : 'Booking cancelled' },
        });
      }
      await tx.visit.update({ where: { id: visit.id }, data: { status: 'CANCELLED' } });
      await tx.queueToken.updateMany({ where: { visitId: visit.id, status: { not: 'DONE' } }, data: { status: 'DONE' } });
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          grossAmount: 0,
          discount: 0,
          netAmount: net,
          // Nothing owed either way reads as settled, not as a bill still due.
          status: net === 0 && paid === 0 ? 'PAID' : statusFor(net, paid),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId, actorId: userId, entity: 'Visit', entityId: visit.id, action: 'CANCEL',
          before: JSON.stringify({ gross: Number(inv.grossAmount), net: Number(inv.netAmount), paid }),
          after: JSON.stringify({ reason: reason ?? null, net, refundDue: Math.max(0, paid - net) }),
        },
      });
    });
    if (visit.partnerLabId) await partnersService.reconcile(visit.partnerLabId);
    return { refundDue: Math.max(0, paid - net) };
  },

  async getSlip(visitId: string) {
    return receptionRepository.getVisitWithDetails(visitId);
  },
};
