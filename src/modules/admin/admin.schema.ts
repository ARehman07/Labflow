import { z } from 'zod';

export const branchSchema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
});

export const departmentSchema = z.object({ name: z.string().min(2).max(80) });

export const doctorSchema = z.object({
  name: z.string().min(2).max(120),
  clinic: z.string().max(120).optional(),
  commissionPct: z.coerce.number().min(0).max(100).default(0),
});

export const userSchema = z.object({
  fullName: z.string().min(2).max(120),
  username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9_.]+$/, 'Letters, numbers, _ and . only'),
  password: z.string().min(6, 'At least 6 characters'),
  roleId: z.string().min(1, 'Select a role'),
  branchId: z.string().optional().or(z.literal('').transform(() => undefined)),
});

const parameterSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(30).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Code: letter first, then letters/numbers/_'),
  unit: z.string().max(30).optional().or(z.literal('').transform(() => undefined)),
  valueType: z.enum(['NUMBER', 'TEXT', 'OPTION', 'CALCULATED']),
  options: z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
  isBold: z.boolean().default(false),
  refLow: z.union([z.coerce.number(), z.literal('').transform(() => undefined)]).optional(),
  refHigh: z.union([z.coerce.number(), z.literal('').transform(() => undefined)]).optional(),
  refText: z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
  formula: z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
});

export const testSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(1).max(30),
  departmentId: z.string().min(1, 'Select a department'),
  tatHours: z.coerce.number().int().min(1).max(720).default(24),
  specimenType: z.enum(['BLOOD', 'SERUM', 'PLASMA', 'URINE', 'STOOL', 'SWAB', 'OTHER']).default('BLOOD'),
  price: z.coerce.number().min(0).default(0),
  parameters: z.array(parameterSchema).min(1, 'Add at least one parameter'),
});
export type TestInput = z.infer<typeof testSchema>;
export type ParameterInput = z.infer<typeof parameterSchema>;
