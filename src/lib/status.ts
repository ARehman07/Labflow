/**
 * Single source of truth for status → visual style. Every badge/pill/dot in the
 * app reads from here, so colours stay consistent and new statuses are one edit.
 * `tone` maps to the semantic Badge variants (see components/ui/Badge.tsx).
 */
export type Tone = 'neutral' | 'info' | 'progress' | 'purple' | 'success' | 'teal' | 'danger' | 'warning';

export interface StatusStyle {
  tone: Tone;
  dot: string; // solid colour for timeline dots / segmented bars
}

/** Lab workflow (OrderLineStatus). */
export const ORDER_STATUS: Record<string, StatusStyle> = {
  BOOKED: { tone: 'neutral', dot: '#64748b' },
  SAMPLE_COLLECTED: { tone: 'info', dot: '#2563eb' },
  SAMPLE_DISPATCHED: { tone: 'info', dot: '#3b82f6' },
  SAMPLE_RECEIVED: { tone: 'info', dot: '#0ea5e9' },
  IN_PROGRESS: { tone: 'progress', dot: '#d97706' },
  RESULT_SAVED: { tone: 'purple', dot: '#7c3aed' },
  APPROVED: { tone: 'success', dot: '#16a34a' },
  PRINTED: { tone: 'teal', dot: '#0d9488' },
  DELIVERED: { tone: 'teal', dot: '#0f766e' },
  RETAKE: { tone: 'danger', dot: '#dc2626' },
  CANCELLED: { tone: 'neutral', dot: '#94a3b8' },
};

/** Result flags. */
export const FLAG_STATUS: Record<string, StatusStyle> = {
  NORMAL: { tone: 'success', dot: '#16a34a' },
  HIGH: { tone: 'danger', dot: '#dc2626' },
  LOW: { tone: 'info', dot: '#2563eb' },
  CRITICAL: { tone: 'danger', dot: '#b91c1c' },
};

/** Invoice status. */
export const INVOICE_STATUS: Record<string, StatusStyle> = {
  DUE: { tone: 'warning', dot: '#d97706' },
  PARTIAL: { tone: 'info', dot: '#2563eb' },
  PAID: { tone: 'success', dot: '#16a34a' },
  REFUNDED: { tone: 'neutral', dot: '#94a3b8' },
};

/** Queue token status. */
export const QUEUE_STATUS: Record<string, StatusStyle> = {
  WAITING: { tone: 'neutral', dot: '#64748b' },
  CALLED: { tone: 'teal', dot: '#0d9488' },
  DONE: { tone: 'success', dot: '#16a34a' },
};
