import { z } from 'zod';

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  method: z.enum(['CASH', 'CARD', 'ONLINE']).default('CASH'),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const refundSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  reason: z.string().max(200).optional(),
});
export type RefundInput = z.infer<typeof refundSchema>;
