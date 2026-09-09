/**
 * Demo data for design and QA work.
 *
 * A lab screen designed against an empty database is designed against a lie:
 * you cannot judge density, truncation, status colour or overflow until real
 * rows are on screen. This fills a day's worth of plausible traffic.
 *
 * Run: npx tsx scripts/seed-demo.ts       (safe to re-run — clears its own rows)
 */
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const FIRST = ['Ayesha', 'Muhammad', 'Fatima', 'Ali', 'Zainab', 'Hassan', 'Maryam',
  'Usman', 'Khadija', 'Bilal', 'Sana', 'Imran', 'Nadia', 'Tariq', 'Rabia',
  'Kashif', 'Hina', 'Adnan', 'Sadia', 'Faisal'];
const LAST = ['Khan', 'Ahmed', 'Butt', 'Sheikh', 'Malik', 'Chaudhry', 'Qureshi',
  'Iqbal', 'Javed', 'Raza'];

const pick = <T,>(a: T[], i: number) => a[i % a.length];
const rand = (n: number) => Math.floor(Math.random() * n);

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: 'demo' } });
  const tenantId = tenant.id;
  const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId } });
  const tests = await prisma.test.findMany({
    where: { tenantId },
    include: { parameters: { include: { referenceRanges: true } } },
  });
  const doctors = await prisma.doctor.findMany({ where: { tenantId } });
  if (tests.length === 0) throw new Error('Run `npm run db:seed` first.');

  // Clear previous demo rows (MR numbers we own) so this is idempotent.
  const old = await prisma.patient.findMany({
    where: { tenantId, mrNo: { startsWith: 'D-' } },
    select: { id: true },
  });
  if (old.length) {
    const ids = old.map((p) => p.id);
    const visits = await prisma.visit.findMany({
      where: { patientId: { in: ids } }, select: { id: true },
    });
    const vIds = visits.map((v) => v.id);
    const lines = await prisma.orderLine.findMany({
      where: { visitId: { in: vIds } }, select: { id: true },
    });
    const lIds = lines.map((l) => l.id);
    await prisma.criticalNotification.deleteMany({ where: { resultValue: { orderLineId: { in: lIds } } } });
    await prisma.resultValue.deleteMany({ where: { orderLineId: { in: lIds } } });
    await prisma.workflowEvent.deleteMany({ where: { orderLineId: { in: lIds } } });
    await prisma.orderLine.deleteMany({ where: { visitId: { in: vIds } } });
    await prisma.payment.deleteMany({ where: { invoice: { visitId: { in: vIds } } } });
    await prisma.workflowEvent.deleteMany({ where: { orderLineId: { in: lIds } } });
    await prisma.invoice.deleteMany({ where: { visitId: { in: vIds } } });
    await prisma.queueToken.deleteMany({ where: { visitId: { in: vIds } } });
    await prisma.familyCardMember.deleteMany({ where: { patientId: { in: ids } } });
    await prisma.familyCard.deleteMany({ where: { primaryPatientId: { in: ids } } });
    await prisma.visit.deleteMany({ where: { id: { in: vIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: ids } } });
  }

  // Spread across the pipeline so every status is represented on screen.
  const STATUSES = [
    'BOOKED', 'BOOKED', 'BOOKED',
    'SAMPLE_COLLECTED', 'SAMPLE_COLLECTED',
    'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS',
    'RESULT_SAVED', 'RESULT_SAVED',
    'APPROVED', 'APPROVED',
    'PRINTED',
  ] as const;

  const now = Date.now();
  let slip = 1000;
  let created = 0;

  for (let i = 0; i < 24; i++) {
    const name = `${pick(FIRST, i)} ${pick(LAST, i * 3)}`;
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrNo: `D-${1000 + i}`,
        fullName: name,
        age: 3 + rand(70),
        ageUnit: 'YEARS',
        sex: i % 3 === 0 ? 'FEMALE' : 'MALE',
        mobile: `030${10000000 + rand(89999999)}`,
      },
    });

    // About a third of the day's work runs late; the rest is comfortably
    // inside its turnaround. A board where everything is overdue teaches you
    // nothing about the design.
    const late = i % 3 === 0;
    const bookedAt = late
      ? new Date(now - (rand(10) + 8) * 3600_000)
      : new Date(now - rand(90) * 60_000);
    const visit = await prisma.visit.create({
      data: {
        tenantId,
        slipNo: String(++slip),
        patientId: patient.id,
        branchId: branch.id,
        doctorId: doctors.length && i % 3 === 0 ? pick(doctors, i).id : null,
        createdById: user.id,
        bookedAt,
      },
    });

    const chosen = [tests[i % tests.length], tests[(i + 3) % tests.length]]
      .filter((t, idx, arr) => arr.findIndex((x) => x.id === t.id) === idx);

    let gross = 0;
    for (const test of chosen) {
      const status = pick([...STATUSES], i + chosen.indexOf(test));
      const line = await prisma.orderLine.create({
        data: {
          tenantId,
          visitId: visit.id,
          testId: test.id,
          status,
          dueAt: new Date(bookedAt.getTime() + test.tatHours * 3600_000),
        },
      });
      gross += 400 + rand(1200);

      // Results for anything past the bench, with a couple deliberately critical
      // so the callback worklist has something in it.
      if (['RESULT_SAVED', 'APPROVED', 'PRINTED'].includes(status)) {
        for (const p of test.parameters) {
          const r = p.referenceRanges[0];
          const low = r?.low ? Number(r.low) : 1;
          const high = r?.high ? Number(r.high) : 10;
          const critical = i % 11 === 0;
          const value = critical
            ? high * 2.4
            : low + Math.random() * Math.max(high - low, 1);
          const flag = critical ? 'CRITICAL' : value > high ? 'HIGH' : value < low ? 'LOW' : 'NORMAL';
          const rv = await prisma.resultValue.create({
            data: {
              tenantId,
              orderLineId: line.id,
              parameterId: p.id,
              value: value.toFixed(1),
              numericValue: Number(value.toFixed(1)),
              flag,
              enteredById: user.id,
              ...(status !== 'RESULT_SAVED' ? { approvedById: user.id, approvedAt: new Date() } : {}),
            },
          });
          if (flag === 'CRITICAL') {
            await prisma.criticalNotification.create({
              data: { tenantId, resultValueId: rv.id },
            });
          }
        }

        // Approval events drive "tests completed today" and the on-time rate.
        if (status !== 'RESULT_SAVED') {
          const dueAt = new Date(bookedAt.getTime() + test.tatHours * 3600_000);
          const approvedAt = late
            ? new Date(dueAt.getTime() + rand(180) * 60_000)   // missed the promise
            : new Date(dueAt.getTime() - rand(120) * 60_000);  // beat it
          await prisma.workflowEvent.create({
            data: {
              tenantId,
              orderLineId: line.id,
              fromState: 'RESULT_SAVED',
              toState: 'APPROVED',
              actorId: user.id,
              at: approvedAt.getTime() > now ? new Date(now - 5 * 60_000) : approvedAt,
            },
          });
        }
      }
      created++;
    }

    const discount = i % 5 === 0 ? Math.round(gross * 0.1) : 0;
    const net = gross - discount;
    const paid = i % 4 === 0 ? Math.round(net / 2) : net;
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        visitId: visit.id,
        grossAmount: gross,
        discount,
        netAmount: net,
        paidAmount: paid,
        status: paid >= net ? 'PAID' : paid > 0 ? 'PARTIAL' : 'DUE',
      } as Prisma.InvoiceUncheckedCreateInput,
    });

    // Actual payment rows — without these the revenue figures read zero, and
    // a dashboard that always shows Rs 0 cannot be judged.
    if (paid > 0) {
      await prisma.payment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          amount: paid,
          method: i % 4 === 0 ? 'CARD' : 'CASH',
          receivedById: user.id,
          at: bookedAt,
        },
      });
    }

    // A token for the first few patients, so the waiting room is not empty.
    if (i < 5) {
      await prisma.queueToken.create({
        data: {
          tenantId,
          visitId: visit.id,
          number: i + 1,
          status: i === 0 ? 'CALLED' : 'WAITING',
        },
      });
    }
  }

  console.log(`✅ Demo data: 24 patients, 24 visits, ${created} order lines across the pipeline.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
