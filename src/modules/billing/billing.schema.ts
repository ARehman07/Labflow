import { z } from 'zod';

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  method: z.enum(['CASH', 'CARD', 'ONLINE']).default('CASH'),
  accountId: z.string().optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const refundSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  /** Required, like taking a payment back: a refund with no stated reason is the
   *  one entry nobody can answer for when the day's cash is counted. */
  reason: z.string().trim().min(3, 'Say why this refund is being given').max(200),
  accountId: z.string().optional(),
});
export type RefundInput = z.infer<typeof refundSchema>;

/** Mark dues pending: take back money recorded as paid that never came in. */
export const reversePaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  reason: z.string().trim().min(3, 'Say why this payment is being taken back').max(200),
  accountId: z.string().optional(),
});
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;
