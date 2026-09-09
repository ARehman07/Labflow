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
});
export type PatientCreateInput = z.infer<typeof patientCreateSchema>;

export const bookVisitSchema = z.object({
  patientId: z.string().min(1, 'Select or create a patient'),
  testIds: z.array(z.string().min(1)).min(1, 'Add at least one test'),
  doctorId: z.string().optional().or(z.literal('').transform(() => undefined)),
  discountType: z.enum(['FIXED', 'PERCENT']).default('FIXED'),
  discountValue: z.coerce.number().min(0).default(0),
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
});
export type BookVisitInput = z.infer<typeof bookVisitSchema>;
