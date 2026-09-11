import { z } from 'zod';

export const patientCreateSchema = z.object({
  fullName: z.string().min(2, 'Name is too short').max(120),
  age: z.coerce.number().int().min(0).max(150).optional(),
  sex: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  mobile: z
    .string()
    .trim()
    .regex(/^0\d{10}$/u, 'Enter a valid 11-digit mobile (e.g. 03001234567)')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  address: z.string().max(200).optional(),
  /** 13 digits; dashes as printed on the card are accepted and dropped. */
  cnic: z
    .string()
    .trim()
    .transform((s) => s.replace(/[-\s]/g, ''))
    .refine((s) => s === '' || /^\d{13}$/u.test(s), 'CNIC must be 13 digits')
    .transform((s) => s || undefined)
    .optional(),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((s) => s === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(s), 'Enter a valid email address')
    .transform((s) => s || undefined)
    .optional(),
  /** yyyy-mm-dd. When given, age is worked out from it. */
  dateOfBirth: z
    .string()
    .trim()
    .refine((s) => s === '' || (!Number.isNaN(Date.parse(s)) && new Date(s) <= new Date()), 'Enter a valid date of birth')
    .transform((s) => (s ? new Date(s) : undefined))
    .optional(),
  ageUnit: z.enum(['YEARS', 'MONTHS', 'DAYS']).default('YEARS'),
  photoDataUrl: z
    .string()
    .max(400_000, 'The photo is too large')
    .refine((s) => s === '' || s.startsWith('data:image/'), 'Invalid photo')
    .transform((s) => s || undefined)
    .optional(),
});
export type PatientCreateInput = z.infer<typeof patientCreateSchema>;

export const bookVisitSchema = z.object({
  patientId: z.string().min(1, 'Select or create a patient'),
  testIds: z.array(z.string().min(1)).default([]),
  /** Packages sold at their own price; their tests are added to the booking. */
  packageIds: z.array(z.string().min(1)).max(20).default([]),
  /** Charge from this price list instead of the branch's standard prices. */
  rateGroupId: z.string().optional().or(z.literal('').transform(() => undefined)),
  /** A B2B partner lab that sent this patient. On account, it is billed instead of the patient. */
  partnerLabId: z.string().optional().or(z.literal('').transform(() => undefined)),
  /** The partner lab's own number for the sample. */
  b2bNo: z.string().trim().max(40).transform((s) => s || undefined).optional(),
  /** Where the patient was booked, when not at the branch counter. Brings its price list. */
  collectionPointId: z.string().optional().or(z.literal('').transform(() => undefined)),
  doctorId: z.string().optional().or(z.literal('').transform(() => undefined)),
  /**
   * A discount typed at the counter: a rupee amount or a percentage of the
   * tests. Never more than the bill (see billing/discount), and discarded when
   * a family card or doctor's rate applies. The reason belongs in `notes`.
   */
  manualDiscount: z
    .object({
      type: z.enum(['FIXED', 'PERCENT']),
      value: z.coerce.number().min(0).max(10_000_000),
    })
    .refine((d) => d.type === 'FIXED' || d.value <= 100, 'A percentage cannot be more than 100')
    .optional(),
  /** Comments for the lab and the record: instructions, referral, why a discount was given. */
  notes: z.string().trim().max(500).transform((s) => s || undefined).optional(),
  /**
   * What to do about a family card on this slip:
   *   NONE   — nothing (or the patient is already on one; that applies itself)
   *   CREATE — issue a new card. The joining fee is added to the bill.
   *   JOIN   — add this patient to an existing card held on another number,
   *            e.g. "my son has the card, put me on his". No fee: the card is
   *            already paid for.
   */
  familyCardMode: z.enum(['NONE', 'CREATE', 'JOIN']).default('NONE'),
  /// For CREATE, the number to hold the card against (defaults to the
  /// patient's own). For JOIN, the number the existing card is held on.
  /// For JOIN, how this patient relates to the card holder.
  familyCardRelation: z
    .enum(['SPOUSE', 'SON', 'DAUGHTER', 'FATHER', 'MOTHER', 'BROTHER', 'SISTER', 'OTHER'])
    .default('OTHER'),
  familyCardMobile: z
    .string()
    .trim()
    .regex(/^0\d{10}$/u, 'Enter a valid 11-digit mobile')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /**
   * Money taken at the counter as the slip is saved. Optional: a patient may
   * pay later, and Billing still handles that. Capped at the bill server-side;
   * change for a larger note is worked out on screen and never recorded.
   */
  payment: z
    .object({
      amount: z.coerce.number().positive(),
      method: z.enum(['CASH', 'CARD', 'ONLINE']).default('CASH'),
      /** The till or bank account it went into; its method wins over `method`. */
      accountId: z.string().optional(),
    })
    .optional(),
  /** Where the sample was taken. */
  sampleSource: z.enum(['INSIDE_LAB', 'OUTSIDE_LAB', 'HOME', 'EXISTING']).default('INSIDE_LAB'),
  /** When the patient is told to collect the report. Defaults to the slowest test's turnaround. */
  reportDueAt: z
    .string()
    .trim()
    .refine((s) => s === '' || !Number.isNaN(Date.parse(s)), 'Enter a valid report date')
    .transform((s) => (s ? new Date(s) : undefined))
    .optional(),
  /** An instruction for a single test, keyed by test id: "fasting since 10 pm". */
  testRemarks: z.record(z.string(), z.string().trim().max(200)).default({}),
});
export type BookVisitInput = z.infer<typeof bookVisitSchema>;
