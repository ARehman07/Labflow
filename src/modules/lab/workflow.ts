/**
 * The test workflow state machine — the safety backbone of the lab.
 * Transitions are data, not scattered conditionals. Every state change is
 * validated against this table before it is persisted, so an order line can
 * never reach an invalid state and a result can never skip approval.
 */

export type OrderLineStatus =
  | 'BOOKED'
  | 'SAMPLE_COLLECTED'
  | 'SAMPLE_DISPATCHED'
  | 'SAMPLE_RECEIVED'
  | 'IN_PROGRESS'
  | 'RESULT_SAVED'
  | 'APPROVED'
  | 'PRINTED'
  | 'DELIVERED'
  | 'RETAKE'
  | 'CANCELLED';

/** Allowed forward/side transitions from each state. */
export const TRANSITIONS: Record<OrderLineStatus, OrderLineStatus[]> = {
  BOOKED: ['SAMPLE_COLLECTED', 'CANCELLED'],
  // Fast path (SAMPLE_COLLECTED → IN_PROGRESS) for small labs, plus the full
  // dispatch/receive chain for labs that track sample movement.
  SAMPLE_COLLECTED: ['IN_PROGRESS', 'SAMPLE_DISPATCHED', 'RETAKE'],
  SAMPLE_DISPATCHED: ['SAMPLE_RECEIVED'],
  SAMPLE_RECEIVED: ['IN_PROGRESS', 'RETAKE'],
  IN_PROGRESS: ['RESULT_SAVED'],
  RESULT_SAVED: ['APPROVED', 'IN_PROGRESS'], // approve, or send back for correction
  APPROVED: ['PRINTED', 'DELIVERED'],
  PRINTED: ['DELIVERED'],
  DELIVERED: [],
  RETAKE: ['SAMPLE_COLLECTED', 'CANCELLED'],
  CANCELLED: [],
};

/** The single "primary" next step shown as the main button on the workboard. */
export const PRIMARY_NEXT: Partial<Record<OrderLineStatus, OrderLineStatus>> = {
  BOOKED: 'SAMPLE_COLLECTED',
  SAMPLE_COLLECTED: 'IN_PROGRESS',
  SAMPLE_DISPATCHED: 'SAMPLE_RECEIVED',
  SAMPLE_RECEIVED: 'IN_PROGRESS',
  RESULT_SAVED: 'APPROVED',
  APPROVED: 'PRINTED',
};

export function canTransition(from: OrderLineStatus, to: OrderLineStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  constructor(from: OrderLineStatus, to: OrderLineStatus) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/** Throws InvalidTransitionError if the transition is not allowed. */
export function assertTransition(from: OrderLineStatus, to: OrderLineStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function isTerminal(status: OrderLineStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** States at which a technician may enter/edit results. */
export function canEnterResults(status: OrderLineStatus): boolean {
  return status === 'IN_PROGRESS' || status === 'RESULT_SAVED';
}
