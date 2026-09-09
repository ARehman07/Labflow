import { z } from 'zod';

/**
 * Commercial policy for the lab. Every field here changes what a patient is
 * charged or what staff are allowed to do, which is why it sits behind
 * settings.manage and not behind admin.manage.
 */
export const labPolicySchema = z.object({
  familyCardDiscountPct: z.coerce.number().min(0, 'Cannot be negative').max(100, 'Cannot exceed 100%'),
  familyCardMemberCap: z.coerce.number().int('Must be a whole number').min(1, 'A card needs at least one member').max(50),
  familyCardFee: z.coerce.number().min(0, 'Cannot be negative').max(1_000_000),
  familyCardDiscountOnIssue: z.coerce.boolean(),
  allowSelfVerify: z.coerce.boolean(),
});
export type LabPolicyInput = z.infer<typeof labPolicySchema>;

/**
 * Letterhead. The logo is held as a data URL rather than in object storage:
 * a lab logo is a few kilobytes, changes about once a year, and has to render
 * on a printout even when the network is down. The cap keeps a 4 MB camera
 * photo from being pasted into every report.
 */
export const MAX_LOGO_BYTES = 300_000;

export const letterheadSchema = z.object({
  name: z.string().min(2, 'The lab needs a name').max(120),
  tagline: z.string().max(120).optional().or(z.literal('').transform(() => undefined)),
  licenseNo: z.string().max(60).optional().or(z.literal('').transform(() => undefined)),
  email: z.string().email('That is not a valid email').max(120).optional().or(z.literal('').transform(() => undefined)),
  reportFooterNote: z.string().max(300).optional().or(z.literal('').transform(() => undefined)),
  logoDataUrl: z
    .string()
    .max(MAX_LOGO_BYTES, 'That image is too large — use one under 200 KB')
    .refine(
      (v) => v === '' || /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v),
      'Use a PNG, JPG, WEBP or SVG image',
    )
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type LetterheadInput = z.infer<typeof letterheadSchema>;
