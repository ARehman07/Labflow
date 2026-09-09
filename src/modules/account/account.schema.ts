import { z } from 'zod';

/**
 * One place that decides what counts as an acceptable password, so the rule is
 * the same whether an owner is issuing one or a staff member is choosing one.
 * Deliberately length-first rather than a symbol maze: a long passphrase a
 * technician can remember beats a short one written on a sticky note.
 */
export const passwordRule = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Too long') // bcrypt truncates beyond 72 bytes
  .refine((v) => !/^\s|\s$/.test(v), 'Cannot start or end with a space');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordRule,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'Choose a password you have not used here before',
    path: ['newPassword'],
  });

/** First sign-in after an owner issues a password: no "current" is demanded twice. */
export const setPasswordSchema = z
  .object({
    newPassword: passwordRule,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  });

export const profileSchema = z.object({
  fullName: z.string().min(2, 'Enter your name').max(80),
  phone: z
    .string()
    .max(20)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
