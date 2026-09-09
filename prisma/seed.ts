import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ALL_PERMISSIONS, DEFAULT_ROLES } from '../src/core/rbac/permissions';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding LabFlow...');

  // 0. Tenant — every scoped row below belongs to this lab.
  //    The code is what staff type at login.
  // Policy is applied on UPDATE as well as CREATE.
  //
  // With `update: {}` the seed silently did nothing to an existing tenant, so
  // every policy value added to the seed after the first run never landed —
  // familyCardFee sat at its column default of 0 while the seed claimed 300.
  // Anything the seed asserts as policy has to be asserted every run.
  const cardPolicy = {
    familyCardDiscountPct: 15,
    familyCardMemberCap: 6,
    familyCardFee: 300,
    familyCardDiscountOnIssue: true,
    allowSelfVerify: false,
  };

  const tenant = await prisma.tenant.upsert({
    where: { code: 'demo' },
    update: cardPolicy,
    create: {
      code: 'demo',
      name: 'LabFlow Demo Laboratory',
      ...cardPolicy,
    },
  });
  const tenantId = tenant.id;

  // 1. Permissions
  for (const p of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { label: p.label },
      create: { code: p.code, label: p.label },
    });
  }

  // 2. Roles + their permissions
  for (const [roleName, codes] of Object.entries(DEFAULT_ROLES)) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: roleName } },
      update: {},
      create: { tenantId, name: roleName },
    });
    // reset mappings for idempotency
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const perms = await prisma.permission.findMany({ where: { code: { in: codes } } });
    await prisma.rolePermission.createMany({
      data: perms.map((perm) => ({ roleId: role.id, permissionId: perm.id })),
    });
  }

  // 3. Branch
  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-main' },
    update: {},
    create: { tenantId,
      id: 'seed-branch-main',
      name: 'Main Branch',
      address: 'Faisalabad',
      phone: '041-0000000',
    },
  });

  // 4. First user (username: admin / password: admin123 — CHANGE after first login)
  //    Seeded as Owner, not Admin: the first account belongs to whoever owns the
  //    lab, and only Owner may set commercial policy (rates, fees, self-verify).
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name: 'Owner' } } });
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { tenantId_username: { tenantId, username: 'admin' } },
    update: {},
    create: { tenantId,
      fullName: 'System Administrator',
      username: 'admin',
      passwordHash,
      roleId: adminRole.id,
      branchId: branch.id,
    },
  });

  // 4b. A couple of referring doctors
  for (const d of [
    { id: 'seed-doc-1', name: 'Dr. Muhammad Badar', clinic: 'City Clinic', commissionPct: 10 },
    { id: 'seed-doc-2', name: 'Dr. Ayesha Khan', clinic: 'Al-Shifa', commissionPct: 15 },
  ]) {
    await prisma.doctor.upsert({
      where: { id: d.id },
      update: {},
      create: { tenantId, id: d.id, name: d.name, clinic: d.clinic, commissionPct: d.commissionPct },
    });
  }

  // 5. Departments
  const haem = await prisma.department.upsert({
    where: { tenantId_name: { tenantId, name: 'Haematology' } },
    update: {},
    create: { tenantId, name: 'Haematology' },
  });
  const chem = await prisma.department.upsert({
    where: { tenantId_name: { tenantId, name: 'Clinical Chemistry' } },
    update: {},
    create: { tenantId, name: 'Clinical Chemistry' },
  });

  // 6. Sample test: Lipid Profile — demonstrates CALCULATED params with CORRECT units.
  //    Ratio parameter has unit = null (fixes the xMed mg/dl-on-ratio bug).
  const lipid = await prisma.test.upsert({
    where: { tenantId_code: { tenantId, code: 'LIPID' } },
    update: {},
    create: { tenantId,
      code: 'LIPID',
      name: 'Lipid Profile',
      departmentId: chem.id,
      tatHours: 24,
      specimenType: 'SERUM',
    },
  });

  const params: Array<{
    code: string;
    name: string;
    unit: string | null;
    valueType: 'NUMBER' | 'CALCULATED';
    sortOrder: number;
    low?: number;
    high?: number;
    formula?: string;
    inputs?: string[];
    displayText?: string;
  }> = [
    { code: 'TCHOL', name: 'Total Cholesterol', unit: 'mg/dL', valueType: 'NUMBER', sortOrder: 1, high: 200, displayText: 'Desirable: < 200' },
    { code: 'HDL', name: 'HDL Cholesterol', unit: 'mg/dL', valueType: 'NUMBER', sortOrder: 2, low: 40, displayText: 'Low risk: > 40' },
    { code: 'TG', name: 'Triglycerides', unit: 'mg/dL', valueType: 'NUMBER', sortOrder: 3, high: 150, displayText: 'Normal: < 150' },
    { code: 'LDL', name: 'LDL Cholesterol (calculated)', unit: 'mg/dL', valueType: 'CALCULATED', sortOrder: 4, high: 100, formula: 'TCHOL - HDL - (TG / 5)', inputs: ['TCHOL', 'HDL', 'TG'], displayText: 'Optimal: < 100' },
    // Ratio: UNITLESS — unit is null. This is the correct standard.
    { code: 'CHOL_HDL', name: 'Cholesterol / HDL Ratio', unit: null, valueType: 'CALCULATED', sortOrder: 5, low: 3.5, high: 5.0, formula: 'TCHOL / HDL', inputs: ['TCHOL', 'HDL'], displayText: 'Desirable: 3.5 - 5.0 (ratio, no unit)' },
  ];

  for (const p of params) {
    const param = await prisma.testParameter.upsert({
      where: { testId_code: { testId: lipid.id, code: p.code } },
      update: {},
      create: { tenantId,
        testId: lipid.id,
        code: p.code,
        name: p.name,
        unit: p.unit,
        valueType: p.valueType,
        sortOrder: p.sortOrder,
      },
    });

    await prisma.referenceRange.deleteMany({ where: { parameterId: param.id } });
    await prisma.referenceRange.create({
      data: { tenantId,
        parameterId: param.id,
        sex: 'ANY',
        low: p.low ?? null,
        high: p.high ?? null,
        displayText: p.displayText ?? null,
      },
    });

    if (p.formula) {
      await prisma.parameterFormula.upsert({
        where: { parameterId: param.id },
        update: { expression: p.formula, inputs: JSON.stringify(p.inputs ?? []) },
        create: { tenantId, parameterId: param.id, expression: p.formula, inputs: JSON.stringify(p.inputs ?? []) },
      });
    }
  }

  // 7. Price for the lipid profile at the main branch
  await prisma.testPrice.upsert({
    where: {
      testId_branchId_effectiveFrom: {
        testId: lipid.id,
        branchId: branch.id,
        effectiveFrom: new Date('2026-01-01'),
      },
    },
    update: {},
    create: { tenantId,
      testId: lipid.id,
      branchId: branch.id,
      price: 1200,
      effectiveFrom: new Date('2026-01-01'),
    },
  });

  // 8. A range of common single-parameter tests (with prices + reference ranges)
  //    so the booking screen and result entry have realistic options.
  const simpleTests: Array<{
    code: string;
    name: string;
    dept: string;
    price: number;
    tat: number;
    specimen: 'BLOOD' | 'SERUM' | 'URINE';
    param: { name: string; unit: string | null; type: 'NUMBER' | 'OPTION'; options?: string; low?: number; high?: number; criticalLow?: number; criticalHigh?: number; text?: string };
  }> = [
    // Panic thresholds (criticalLow / criticalHigh) are the values at which a
    // clinician must be telephoned, not merely flagged on a report. Confirm
    // these against your own lab's policy before going live.
    { code: 'CBC', name: 'Complete Blood Count', dept: haem.id, price: 600, tat: 6, specimen: 'BLOOD', param: { name: 'Haemoglobin', unit: 'g/dL', type: 'NUMBER', low: 13, high: 17, criticalLow: 7, criticalHigh: 20, text: 'Male: 13-17, Female: 12-15' } },
    { code: 'RBS', name: 'Blood Sugar Random', dept: chem.id, price: 250, tat: 2, specimen: 'SERUM', param: { name: 'Random Blood Sugar', unit: 'mg/dL', type: 'NUMBER', low: 70, high: 140, criticalLow: 45, criticalHigh: 450, text: 'Normal: 70-140' } },
    { code: 'CREAT', name: 'Serum Creatinine', dept: chem.id, price: 400, tat: 6, specimen: 'SERUM', param: { name: 'Creatinine', unit: 'mg/dL', type: 'NUMBER', low: 0.6, high: 1.3, criticalHigh: 6, text: 'Normal: 0.6-1.3' } },
    { code: 'HBA1C', name: 'HbA1c', dept: chem.id, price: 1500, tat: 24, specimen: 'BLOOD', param: { name: 'HbA1c', unit: '%', type: 'NUMBER', high: 5.7, text: 'Normal < 5.7, Prediabetes 5.7-6.4, Diabetes >= 6.5' } },
    { code: 'ABO', name: 'Blood Group (ABO & Rh)', dept: haem.id, price: 300, tat: 2, specimen: 'BLOOD', param: { name: 'Blood Group', unit: null, type: 'OPTION', options: 'A+,A-,B+,B-,O+,O-,AB+,AB-' } },
    { code: 'URIC', name: 'Serum Uric Acid', dept: chem.id, price: 450, tat: 6, specimen: 'SERUM', param: { name: 'Uric Acid', unit: 'mg/dL', type: 'NUMBER', low: 3.5, high: 7.2, text: 'Normal: 3.5-7.2' } },
  ];

  for (const st of simpleTests) {
    const test = await prisma.test.upsert({
      where: { tenantId_code: { tenantId, code: st.code } },
      update: {},
      create: { tenantId, code: st.code, name: st.name, departmentId: st.dept, tatHours: st.tat, specimenType: st.specimen },
    });
    const param = await prisma.testParameter.upsert({
      where: { testId_code: { testId: test.id, code: 'V1' } },
      update: {},
      create: { tenantId,
        testId: test.id,
        code: 'V1',
        name: st.param.name,
        unit: st.param.unit,
        valueType: st.param.type,
        options: st.param.options ?? null,
        sortOrder: 1,
      },
    });
    await prisma.referenceRange.deleteMany({ where: { parameterId: param.id } });
    await prisma.referenceRange.create({
      data: { tenantId,
        parameterId: param.id,
        sex: 'ANY',
        low: st.param.low ?? null,
        high: st.param.high ?? null,
        criticalLow: st.param.criticalLow ?? null,
        criticalHigh: st.param.criticalHigh ?? null,
        displayText: st.param.text ?? null,
      },
    });
    await prisma.testPrice.upsert({
      where: { testId_branchId_effectiveFrom: { testId: test.id, branchId: branch.id, effectiveFrom: new Date('2026-01-01') } },
      update: { price: st.price },
      create: { tenantId, testId: test.id, branchId: branch.id, price: st.price, effectiveFrom: new Date('2026-01-01') },
    });
  }

  // Notifiable conditions — statutory reporting obligations.
  // Replace with your province's official list.
  for (const c of [
    { code: 'TB', name: 'Tuberculosis' },
    { code: 'HEPB', name: 'Hepatitis B' },
    { code: 'HEPC', name: 'Hepatitis C' },
    { code: 'DENGUE', name: 'Dengue Fever' },
    { code: 'MALARIA', name: 'Malaria' },
    { code: 'TYPHOID', name: 'Typhoid Fever' },
  ]) {
    await prisma.notifiableCondition.upsert({
      where: { tenantId_code: { tenantId, code: c.code } },
      update: {},
      create: { tenantId, code: c.code, name: c.name, authority: 'District Health Officer' },
    });
  }

  console.log('✅ Seed complete. Login: admin / admin123  (change the password!)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
