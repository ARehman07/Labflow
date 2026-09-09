import { z } from 'zod';

export const ledgerEntrySchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  /** Only CASH moves the till. Defaulted because most lab entries are cash. */
  method: z.enum(['CASH', 'BANK', 'CARD']).default('CASH'),
  category: z.string().min(1, 'Category is required').max(60),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  note: z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
});
export type LedgerEntryInput = z.infer<typeof ledgerEntrySchema>;
