import { z } from 'zod';

export const orderLineStatusSchema = z.enum([
  'BOOKED',
  'SAMPLE_COLLECTED',
  'SAMPLE_DISPATCHED',
  'SAMPLE_RECEIVED',
  'IN_PROGRESS',
  'RESULT_SAVED',
  'APPROVED',
  'PRINTED',
  'DELIVERED',
  'RETAKE',
  'CANCELLED',
]);

export const advanceSchema = z.object({
  orderLineId: z.string().min(1),
  to: orderLineStatusSchema,
});

export const saveResultsSchema = z.object({
  orderLineId: z.string().min(1),
  // values keyed by parameter CODE
  values: z.record(z.string(), z.string()),
});
export type SaveResultsInput = z.infer<typeof saveResultsSchema>;
