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
  // BOOKED is the undo: a tube marked collected by mistake (wrong patient's
  // card, a double tap) goes back to the draw list — only while no result
  // has been written against it. See labService.undoCollect.
  SAMPLE_COLLECTED: ['IN_PROGRESS', 'SAMPLE_DISPATCHED', 'RETAKE', 'BOOKED'],
  SAMPLE_DISPATCHED: ['SAMPLE_RECEIVED'],
  SAMPLE_RECEIVED: ['IN_PROGRESS', 'RETAKE'],
  // Retake while running: the sample turned out haemolysed or clotted.
  IN_PROGRESS: ['RESULT_SAVED', 'RETAKE'],
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
  SAMPLE_DISPATCHED: 'SAMPLE_RECEIVED',
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

/**
 * States at which a technician may enter/edit results.
 *
 * A sample in hand is enough. There used to be a separate "Start test" press
 * between collecting and entering, which recorded nothing anyone used and
 * cost a click on every tube; saving results now passes through IN_PROGRESS
 * on the way, so the event history still shows the step.
 */
export function canEnterResults(status: OrderLineStatus): boolean {
  return status === 'SAMPLE_COLLECTED'
    || status === 'SAMPLE_RECEIVED'
    || status === 'IN_PROGRESS'
    || status === 'RESULT_SAVED';
}
