import type { OrderLineStatus } from './workflow';

/**
 * The four stages the board groups work into, and the raw statuses behind each.
 *
 * Shared with the server so the chip counts can be taken over everything the
 * filter matches, not only the cards that fitted on the page. The words and
 * colours stay in the board itself; only the grouping lives here.
 */
export const BOARD_STAGES: { key: 'COLLECT' | 'PROGRESS' | 'APPROVAL' | 'READY'; statuses: OrderLineStatus[] }[] = [
  { key: 'COLLECT', statuses: ['BOOKED'] },
  { key: 'PROGRESS', statuses: ['SAMPLE_COLLECTED', 'SAMPLE_DISPATCHED', 'SAMPLE_RECEIVED', 'IN_PROGRESS', 'RETAKE'] },
  { key: 'APPROVAL', statuses: ['RESULT_SAVED'] },
  { key: 'READY', statuses: ['APPROVED', 'PRINTED', 'DELIVERED'] },
];

export type BoardStageKey = (typeof BOARD_STAGES)[number]['key'] | 'ALL';

/** Patients waiting and tests outstanding, per stage. */
export type BoardCounts = Record<BoardStageKey, { patients: number; tests: number }>;
