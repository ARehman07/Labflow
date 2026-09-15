/**
 * The parts of LabFlow a lab can switch off.
 *
 * A small lab doing walk-ins at one counter has no collection points, no B2B
 * partners and no home collection, and every one of those left on is a field
 * someone has to read past on every booking. Each switch here hides its part
 * everywhere — menu, screens, the booking steps — and the server stops
 * accepting it, so an old tab cannot sneak a switched-off option in.
 *
 * Everything is on unless the lab turns it off, so a new lab sees the whole app.
 */

export const FEATURE_KEYS = [
  // Booking
  'booking.sampleInLab', 'booking.sampleOutside', 'booking.sampleHome', 'booking.sampleExisting',
  'booking.reportDue', 'booking.referringDoctor', 'booking.packages', 'booking.quickPicks',
  'booking.priceLists', 'booking.collectionPoints', 'booking.b2b',
  'booking.familyCards', 'booking.manualDiscount', 'booking.testNotes', 'booking.comments', 'booking.payAtCounter',
  // Lab
  'lab.queue', 'lab.retake', 'lab.sendOut', 'lab.critical', 'lab.notifiable', 'lab.qc', 'lab.stock', 'lab.analyzers', 'lab.ai',
  // Money
  'money.referrals',
  // Patients
  'patients.documents', 'patients.portal',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type Features = Record<FeatureKey, boolean>;

export const FEATURE_GROUPS: { group: 'BOOKING' | 'LAB' | 'MONEY' | 'PATIENTS'; keys: FeatureKey[] }[] = [
  { group: 'BOOKING', keys: FEATURE_KEYS.filter((k) => k.startsWith('booking.')) },
  { group: 'LAB', keys: FEATURE_KEYS.filter((k) => k.startsWith('lab.')) },
  { group: 'MONEY', keys: FEATURE_KEYS.filter((k) => k.startsWith('money.')) },
  { group: 'PATIENTS', keys: FEATURE_KEYS.filter((k) => k.startsWith('patients.')) },
];

/** The four ways a sample can be taken, and the switch for each. */
export const SAMPLE_SOURCE_FEATURES = {
  INSIDE_LAB: 'booking.sampleInLab',
  OUTSIDE_LAB: 'booking.sampleOutside',
  HOME: 'booking.sampleHome',
  EXISTING: 'booking.sampleExisting',
} as const satisfies Record<string, FeatureKey>;

/**
 * A lab's switches from whatever was stored: unknown keys dropped, anything
 * missing on, and never every way of taking a sample off — a booking has to
 * say where its sample came from.
 */
export function normaliseFeatures(input: Record<string, unknown> | null | undefined): Features {
  const out = Object.fromEntries(FEATURE_KEYS.map((k) => [k, input?.[k] !== false])) as Features;
  if (!Object.values(SAMPLE_SOURCE_FEATURES).some((k) => out[k])) out['booking.sampleInLab'] = true;
  return out;
}

export function parseFeatures(raw: string | null | undefined): Features {
  if (!raw) return normaliseFeatures(null);
  try {
    const value = JSON.parse(raw);
    return normaliseFeatures(value && typeof value === 'object' ? value : null);
  } catch {
    return normaliseFeatures(null);
  }
}

export const ALL_FEATURES_ON: Features = normaliseFeatures(null);

/** The features a lab's plan leaves out, from what the platform console stored. */
export function parseLocked(raw: string | null | undefined): FeatureKey[] {
  try {
    const value = JSON.parse(raw ?? '[]');
    return Array.isArray(value) ? value.filter((k): k is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(k)) : [];
  } catch {
    return [];
  }
}

/** A lab's switches with its plan's exclusions forced off — never every way of taking a sample. */
export function applyLocks(features: Features, locked: FeatureKey[]): Features {
  const out = { ...features };
  for (const k of locked) out[k] = false;
  if (!Object.values(SAMPLE_SOURCE_FEATURES).some((k) => out[k])) out['booking.sampleInLab'] = true;
  return out;
}
