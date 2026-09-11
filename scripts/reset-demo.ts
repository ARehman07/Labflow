/**
 * Wipes the working data and lays down a small, deliberate demo set.
 *
 * Not the same job as scripts/seed-demo.ts. That one fills the database with a
 * day's worth of plausible traffic so a screen can be judged under load. This
 * one is for showing the system to somebody: every tab has one or two rows,
 * each chosen to demonstrate a different state, and nothing else.
 *
 * What it keeps: the tenant and its policy, branches, permissions, roles, user
 * accounts, the test catalogue, departments and referring doctors. Those are
 * configuration, not traffic.
 *
 * What it clears: every patient, visit, result, invoice, payment, family card,
 * ledger entry, queue token and audit row.
 *
 * Run: npm run db:demo    (safe to re-run)
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { computeResultSet, ageInDays, type AgeUnit, type ParameterDef } from '../src/modules/lab/calc-engine';

const prisma = new PrismaClient();

/** Child-to-parent, so foreign keys never block a delete. */
const WIPE_ORDER = [
  'criticalNotification',
  'notifiableReport',
  'portalSession',
  'portalOtp',
  'delivery',
  'report',
  'queueToken',
  'notification',
  'commission',
  'refund',
  'payment',
  'invoice',
  'ledgerEntry',
  'resultValue',
  'workflowEvent',
  'orderLine',
  'sample',
  'familyCardMember',
  'familyCard',
  'visit',
  'patient',
  'auditLog',
] as const;

const HOURS = (n: number) => n * 60 * 60 * 1000;

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow();
  const tenantId = tenant.id;
  const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } });
  const owner = await prisma.user.findFirstOrThrow({ where: { tenantId, username: 'admin' } });
  const staff = await prisma.user.findFirst({ where: { tenantId, username: 'sana' } }) ?? owner;

  const byCode = new Map(
    (await prisma.test.findMany({
      where: { tenantId },
      include: { parameters: { include: { referenceRanges: true } }, prices: true },
    })).map((t) => [t.code, t]),
  );
  const test = (code: string) => {
    const t = byCode.get(code);
    if (!t) throw new Error(`Test ${code} is missing from the catalogue`);
    return t;
  };
  const priceOf = (code: string) => {
    const t = test(code);
    const latest = [...t.prices].sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
    return latest ? Number(latest.price) : 0;
  };

  const doctors = await prisma.doctor.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  const badar = doctors.find((d) => /Badar/.test(d.name)) ?? doctors[0];
  const ayesha = doctors.find((d) => /Ayesha/.test(d.name)) ?? doctors[0];

  // ── 1. Clear ────────────────────────────────────────────────────────────
  const cleared: Record<string, number> = {};
  await prisma.$transaction(
    async (tx) => {
      for (const model of WIPE_ORDER) {
        const delegate = (tx as unknown as Record<string, { deleteMany?: (a: unknown) => Promise<{ count: number }> }>)[model];
        if (!delegate?.deleteMany) continue;
        const res = await delegate.deleteMany({ where: { tenantId } });
        if (res.count > 0) cleared[model] = res.count;
      }
    },
    // Twenty-two round trips finish instantly against a local file and blow
    // through Prisma's 5s default against a hosted database a continent away.
    // The wipe has to stay one transaction — a half-cleared database is worse
    // than a slow one — so give it room instead of splitting it up.
    { timeout: 120_000, maxWait: 30_000 },
  );
  console.log('cleared:', cleared);

  const now = new Date();
  const at = (hoursAgo: number) => new Date(now.getTime() - HOURS(hoursAgo));

  // ── 2. Patients ─────────────────────────────────────────────────────────
  const people: {
    key: string; fullName: string; age: number; sex: 'MALE' | 'FEMALE'; mobile: string; address: string;
  }[] = [
    { key: 'ahmed', fullName: 'Ahmed Raza', age: 42, sex: 'MALE', mobile: '03001234567', address: 'Peoples Colony No. 1, Faisalabad' },
    { key: 'sadia', fullName: 'Sadia Bashir', age: 34, sex: 'FEMALE', mobile: '03018765432', address: 'Madina Town, Faisalabad' },
    { key: 'usman', fullName: 'Usman Ghani', age: 57, sex: 'MALE', mobile: '03217654321', address: 'Gulberg, Faisalabad' },
    { key: 'hina', fullName: 'Hina Aslam', age: 27, sex: 'FEMALE', mobile: '03331112233', address: 'Susan Road, Faisalabad' },
    // Second person on Ahmed's family card, to show the card actually shared.
    { key: 'zoya', fullName: 'Zoya Ahmed', age: 9, sex: 'FEMALE', mobile: '03001234567', address: 'Peoples Colony No. 1, Faisalabad' },
  ];

  const patients: Record<string, { id: string; mrNo: string; fullName: string }> = {};
  let mr = 1;
  for (const p of people) {
    const created = await prisma.patient.create({
      data: {
        tenantId,
        mrNo: `MR-${String(mr++).padStart(6, '0')}`,
        fullName: p.fullName,
        age: p.age,
        ageUnit: 'YEARS',
        sex: p.sex,
        mobile: p.mobile,
        address: p.address,
      },
    });
    patients[p.key] = { id: created.id, mrNo: created.mrNo, fullName: created.fullName };
  }

  // ── 3. One family card, actually shared ─────────────────────────────────
  const card = await prisma.familyCard.create({
    data: {
      tenantId,
      mobile: '03001234567',
      primaryPatientId: patients.ahmed.id,
      discountPct: tenant.familyCardDiscountPct,
      memberCap: tenant.familyCardMemberCap,
      feeAmount: tenant.familyCardFee,
      issuedById: owner.id,
      isActive: true,
      issuedAt: at(30),
    },
  });
  await prisma.familyCardMember.createMany({
    data: [
      { tenantId, cardId: card.id, patientId: patients.ahmed.id, relation: 'SELF', addedAt: at(30) },
      { tenantId, cardId: card.id, patientId: patients.zoya.id, relation: 'DAUGHTER', addedAt: at(28) },
    ],
  });
  // The joining fee is income the day the card is sold.
  await prisma.ledgerEntry.create({
    data: {
      tenantId, branchId: branch.id, type: 'INCOME', method: 'CASH',
      category: 'Family Card Fee', amount: tenant.familyCardFee,
      note: `Family card issued for 03001234567`, at: at(30),
    },
  });

  let slip = 1;
  const nextSlip = () => String(slip++).padStart(5, '0');

  /** Builds a visit with its order lines, invoice and payment in one go. */
  async function makeVisit(opts: {
    patient: { id: string };
    testCodes: string[];
    bookedHoursAgo: number;
    doctorId?: string | null;
    discountPct?: number;
    cardId?: string | null;
    cardFee?: number;
    pay?: { amount: number; method: 'CASH' | 'CARD' | 'ONLINE'; hoursAgo?: number } | null;
    lineStatus: NonNullable<Prisma.OrderLineUncheckedCreateWithoutVisitInput['status']>;
  }) {
    const gross = opts.testCodes.reduce((s, c) => s + priceOf(c), 0);
    const discount = Math.round((gross * (opts.discountPct ?? 0)) / 100);
    const fee = opts.cardFee ?? 0;
    const net = gross - discount + fee;
    const paid = opts.pay?.amount ?? 0;
    const bookedAt = at(opts.bookedHoursAgo);

    const visit = await prisma.visit.create({
      data: {
        tenantId,
        branchId: branch.id,
        patientId: opts.patient.id,
        doctorId: opts.doctorId ?? null,
        slipNo: nextSlip(),
        bookedAt,
        createdById: staff.id,
        status: 'OPEN',
        orderLines: {
          create: opts.testCodes.map((code) => ({
            tenantId,
            testId: test(code).id,
            status: opts.lineStatus,
            dueAt: new Date(bookedAt.getTime() + HOURS(test(code).tatHours ?? 24)),
            createdAt: bookedAt,
          })),
        },
      },
      include: { orderLines: true },
    });

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        visitId: visit.id,
        grossAmount: gross,
        discount,
        // MANUAL is not a member of DiscountSource — the values are
        // MANUAL_FIXED / MANUAL_PERCENT. SQLite stored the wrong string happily;
        // Postgres would have rejected the row.
        discountSource: opts.cardId ? 'FAMILY_CARD' : discount > 0 ? 'MANUAL_PERCENT' : 'NONE',
        familyCardId: opts.cardId ?? null,
        familyCardFee: fee,
        netAmount: net,
        paidAmount: paid,
        status: paid <= 0 ? 'DUE' : paid >= net ? 'PAID' : 'PARTIAL',
        createdAt: bookedAt,
      },
    });

    if (opts.pay) {
      const paidAt = at(opts.pay.hoursAgo ?? opts.bookedHoursAgo);
      await prisma.payment.create({
        data: {
          tenantId, invoiceId: invoice.id, amount: opts.pay.amount,
          method: opts.pay.method, receivedById: staff.id, at: paidAt,
        },
      });
      // Commission accrues on money actually received.
      if (opts.doctorId) {
        const doc = doctors.find((d) => d.id === opts.doctorId);
        const pct = doc ? Number(doc.commissionPct) : 0;
        if (pct > 0) {
          await prisma.commission.create({
            data: {
              tenantId, doctorId: opts.doctorId, visitId: visit.id,
              amount: (opts.pay.amount * pct) / 100, status: 'ACCRUED', at: paidAt,
            },
          });
        }
      }
    }
    return visit;
  }

  // ── 4. Visits, one per pipeline stage ───────────────────────────────────

  // Just booked — sits in "To collect" on the workboard.
  const vBooked = await makeVisit({
    patient: patients.hina, testCodes: ['CBC', 'RBS'], bookedHoursAgo: 1,
    doctorId: badar?.id, lineStatus: 'BOOKED', pay: null,
  });

  // Sample taken, running now — "In progress".
  const vProgress = await makeVisit({
    patient: patients.sadia, testCodes: ['LIPID'], bookedHoursAgo: 4,
    doctorId: ayesha?.id, lineStatus: 'IN_PROGRESS',
    pay: { amount: priceOf('LIPID'), method: 'CARD', hoursAgo: 4 },
  });

  // Results entered, waiting for a second pair of eyes — "For approval".
  const vApproval = await makeVisit({
    patient: patients.usman, testCodes: ['HBA1C', 'CREAT'], bookedHoursAgo: 26,
    doctorId: badar?.id, lineStatus: 'RESULT_SAVED',
    // Paid on the day the sample was taken, not the day it was booked.
    pay: { amount: priceOf('HBA1C') + priceOf('CREAT'), method: 'CASH', hoursAgo: 3 },
  });

  // Released — this is the one with a printable report, on the family card.
  const vReady = await makeVisit({
    patient: patients.ahmed, testCodes: ['LIPID', 'ABO'], bookedHoursAgo: 30,
    doctorId: ayesha?.id, lineStatus: 'APPROVED',
    discountPct: Number(tenant.familyCardDiscountPct), cardId: card.id,
    cardFee: Number(tenant.familyCardFee),
    pay: null, // left unpaid so Billing shows a due invoice
  });

  // ── 5. Results ──────────────────────────────────────────────────────────
  /**
   * Results go through the same calculation engine the result-entry screen
   * uses, so calculated parameters (LDL, ratios) are filled in and every flag
   * is judged against the right age/sex range. Writing raw values directly
   * left calculated rows blank — which then printed as "—" on a released
   * demo report.
   */
  async function setResults(visitId: string, values: Record<string, string>, approve: boolean) {
    const lines = await prisma.orderLine.findMany({
      where: { visitId },
      include: {
        visit: { include: { patient: true } },
        test: { include: { parameters: { include: { referenceRanges: true, formula: true } } } },
      },
    });
    for (const line of lines) {
      if (!line.test.parameters.some((p) => values[p.code] !== undefined)) continue;

      const params: ParameterDef[] = line.test.parameters.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        unit: p.unit,
        valueType: p.valueType as ParameterDef['valueType'],
        sortOrder: p.sortOrder,
        referenceRanges: p.referenceRanges.map((r) => ({
          sex: r.sex as 'ANY' | 'MALE' | 'FEMALE',
          ageMinDays: r.ageMinDays,
          ageMaxDays: r.ageMaxDays,
          low: r.low === null ? null : Number(r.low),
          high: r.high === null ? null : Number(r.high),
          criticalLow: r.criticalLow === null ? null : Number(r.criticalLow),
          criticalHigh: r.criticalHigh === null ? null : Number(r.criticalHigh),
          displayText: r.displayText,
        })),
        formula: p.formula ? { expression: p.formula.expression, inputs: [] } : null,
      }));

      const patient = line.visit.patient;
      const computed = computeResultSet(params, values, {
        ageDays: ageInDays(patient as { dateOfBirth: Date | null; age: number | null; ageUnit: AgeUnit | null }),
        sex: patient.sex as 'MALE' | 'FEMALE' | 'OTHER' | null,
      });

      for (const c of computed) {
        if (c.value == null || c.value === '') continue;
        await prisma.resultValue.create({
          data: {
            tenantId,
            orderLineId: line.id,
            parameterId: c.parameterId,
            value: c.value,
            numericValue: c.numericValue,
            flag: c.flag as NonNullable<Prisma.ResultValueUncheckedCreateInput['flag']>,
            isCalculated: c.isCalculated,
            enteredById: staff.id,
            createdAt: at(3),
            ...(approve ? { approvedById: owner.id, approvedAt: at(2) } : {}),
          },
        });
      }
    }
  }

  // A borderline-but-normal panel: nothing to chase.
  await setResults(vApproval.id, { V1: '5.4' }, false);
  // The released report, with one clearly high value so the report shows a flag.
  await setResults(vReady.id, { TCHOL: '265', HDL: '38', TG: '190', V1: 'B+' }, true);

  // ── 6. One critical result, so the callback loop has something real ─────
  const criticalVisit = await makeVisit({
    patient: patients.usman, testCodes: ['RBS'], bookedHoursAgo: 2,
    doctorId: badar?.id, lineStatus: 'RESULT_SAVED',
    pay: { amount: priceOf('RBS'), method: 'CASH', hoursAgo: 2 },
  });
  const critLine = await prisma.orderLine.findFirstOrThrow({
    where: { visitId: criticalVisit.id },
    include: { test: { include: { parameters: true } } },
  });
  const critParam = critLine.test.parameters[0];
  const critValue = await prisma.resultValue.create({
    data: {
      tenantId, orderLineId: critLine.id, parameterId: critParam.id,
      value: '441', numericValue: 441, flag: 'CRITICAL', enteredById: staff.id, createdAt: at(1),
    },
  });
  await prisma.criticalNotification.create({
    data: { tenantId, resultValueId: critValue.id, createdAt: at(1) },
  });

  // ── 6b. A little history ────────────────────────────────────────────────
  // Insights charts a week. With only today's rows the revenue chart is a
  // single bar, which reads as broken rather than as new. These are closed,
  // paid, delivered visits — they sort to the bottom of the workboard the way
  // finished work should.
  const history: { key: keyof typeof patients; code: string; daysAgo: number; method: 'CASH' | 'CARD' }[] = [
    { key: 'sadia', code: 'CBC', daysAgo: 1, method: 'CASH' },
    { key: 'usman', code: 'URIC', daysAgo: 2, method: 'CASH' },
    { key: 'hina', code: 'RBS', daysAgo: 3, method: 'CARD' },
    { key: 'ahmed', code: 'CBC', daysAgo: 4, method: 'CASH' },
    { key: 'sadia', code: 'HBA1C', daysAgo: 5, method: 'CASH' },
    { key: 'usman', code: 'CREAT', daysAgo: 6, method: 'CASH' },
  ];
  for (const h of history) {
    const hoursAgo = h.daysAgo * 24 - 6; // mid-morning on that day
    const v = await makeVisit({
      patient: patients[h.key], testCodes: [h.code], bookedHoursAgo: hoursAgo,
      doctorId: h.daysAgo % 2 === 0 ? badar?.id : ayesha?.id,
      lineStatus: 'DELIVERED',
      pay: { amount: priceOf(h.code), method: h.method, hoursAgo },
    });
    await setResults(v.id, { V1: h.code === 'ABO' ? 'O+' : '5.1' }, true);
    await prisma.visit.update({ where: { id: v.id }, data: { status: 'COMPLETED' } });
  }

  // ── 7. Waiting room ─────────────────────────────────────────────────────
  await prisma.queueToken.createMany({
    data: [
      { tenantId, visitId: vBooked.id, number: 1, status: 'WAITING', at: at(1) },
      { tenantId, visitId: criticalVisit.id, number: 2, status: 'WAITING', at: at(0.5) },
    ],
  });

  // ── 8. Day book ─────────────────────────────────────────────────────────
  await prisma.ledgerEntry.createMany({
    data: [
      { tenantId, branchId: branch.id, type: 'EXPENSE', method: 'CASH',
        category: 'Reagents', amount: 950, note: 'Control serum — 1 vial', at: at(6) },
      { tenantId, branchId: branch.id, type: 'EXPENSE', method: 'CASH',
        category: 'Transport', amount: 350, note: 'Sample pickup — Gulberg', at: at(5) },
    ] as Prisma.LedgerEntryCreateManyInput[],
  });

  // ── Summary ─────────────────────────────────────────────────────────────
  const counts = {
    patients: await prisma.patient.count({ where: { tenantId } }),
    visits: await prisma.visit.count({ where: { tenantId } }),
    invoices: await prisma.invoice.count({ where: { tenantId } }),
    familyCards: await prisma.familyCard.count({ where: { tenantId } }),
    queueTokens: await prisma.queueToken.count({ where: { tenantId } }),
    ledgerEntries: await prisma.ledgerEntry.count({ where: { tenantId } }),
    criticalOpen: await prisma.criticalNotification.count({ where: { tenantId, notifiedAt: null } }),
    users: await prisma.user.count({ where: { tenantId } }),
    roles: await prisma.role.count({ where: { tenantId } }),
    tests: await prisma.test.count({ where: { tenantId } }),
  };
  console.log('\ndemo data ready:', counts);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
