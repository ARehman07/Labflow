import { evaluateExpression } from './expression';

export type ResultFlag = 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL';
export type ParamValueType = 'NUMBER' | 'TEXT' | 'OPTION' | 'CALCULATED' | 'CUTOFF';

export interface ReferenceRangeDef {
  sex: 'ANY' | 'MALE' | 'FEMALE';
  /** Age bands in DAYS, so a 3-day-old and a 30-year-old compare identically. */
  ageMinDays: number;
  ageMaxDays: number;
  low: number | null;
  high: number | null;
  /** Panic thresholds. Outside these, the result is CRITICAL. */
  criticalLow: number | null;
  criticalHigh: number | null;
  displayText: string | null;
}

export type AgeUnit = 'YEARS' | 'MONTHS' | 'DAYS';

/** Days per unit. Approximate by design — ranges are banded, not exact. */
const DAYS_PER_UNIT: Record<AgeUnit, number> = { YEARS: 365, MONTHS: 30, DAYS: 1 };

/**
 * Age in days, preferring a date of birth when one is recorded. Entered age is
 * a fallback, and carries its own unit — labs here register newborns in days.
 */
export function ageInDays(
  patient: { dateOfBirth?: Date | null; age?: number | null; ageUnit?: AgeUnit | null },
  now: Date = new Date(),
): number | null {
  if (patient.dateOfBirth) {
    const ms = now.getTime() - new Date(patient.dateOfBirth).getTime();
    return Math.max(0, Math.floor(ms / 86_400_000));
  }
  if (patient.age === null || patient.age === undefined) return null;
  return Math.round(patient.age * DAYS_PER_UNIT[patient.ageUnit ?? 'YEARS']);
}

export interface ParameterDef {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  valueType: ParamValueType;
  sortOrder: number;
  referenceRanges: ReferenceRangeDef[];
  formula: { expression: string; inputs: string[] } | null;
  /** CUTOFF parameters: at or above this the result reads positive. */
  cutoff?: number | null;
}

export interface PatientContext {
  ageDays: number | null;
  sex: 'MALE' | 'FEMALE' | 'OTHER' | null;
}

export interface ComputedResult {
  parameterId: string;
  code: string;
  value: string | null; // display value
  numericValue: number | null;
  flag: ResultFlag;
  isCalculated: boolean;
}

/**
 * Pick the reference range that best matches the patient.
 *
 * Most specific wins: a range naming the patient's sex beats one saying ANY,
 * and among equally-specific matches the narrowest age band wins. Ordering by
 * specificity rather than by declaration order means a lab can add a neonatal
 * band without having to place it first in the list.
 */
export function pickRange(
  ranges: ReferenceRangeDef[],
  patient: PatientContext,
): ReferenceRangeDef | null {
  if (ranges.length === 0) return null;

  const sexMatches = (r: ReferenceRangeDef) =>
    r.sex === 'ANY' || (patient.sex !== null && r.sex === patient.sex);
  const ageMatches = (r: ReferenceRangeDef) =>
    patient.ageDays === null ||
    (patient.ageDays >= r.ageMinDays && patient.ageDays <= r.ageMaxDays);

  const applicable = ranges.filter((r) => sexMatches(r) && ageMatches(r));
  if (applicable.length === 0) return null;

  const width = (r: ReferenceRangeDef) => r.ageMaxDays - r.ageMinDays;
  return [...applicable].sort((a, b) => {
    const sexRank = (r: ReferenceRangeDef) => (r.sex === 'ANY' ? 1 : 0);
    if (sexRank(a) !== sexRank(b)) return sexRank(a) - sexRank(b);
    return width(a) - width(b);
  })[0];
}

/**
 * Flag a numeric value against a reference range.
 *
 * Panic thresholds are checked FIRST: a potassium of 7.5 is not merely "high",
 * it is critical, and the two must not be reported the same way. Before this,
 * CRITICAL existed in the enum but nothing could ever produce it.
 */
export function flagValue(value: number | null, range: ReferenceRangeDef | null): ResultFlag {
  if (value === null || Number.isNaN(value) || !range) return 'NORMAL';
  if (range.criticalLow !== null && value <= range.criticalLow) return 'CRITICAL';
  if (range.criticalHigh !== null && value >= range.criticalHigh) return 'CRITICAL';
  if (range.low !== null && value < range.low) return 'LOW';
  if (range.high !== null && value > range.high) return 'HIGH';
  return 'NORMAL';
}

/**
 * A screening value read against its cut-off (serology: HBsAg, anti-HCV, HIV).
 * At or above the cut-off the result is positive, flagged HIGH so it counts
 * as abnormal everywhere a flag is counted.
 */
export function cutoffFlag(value: number | null, cutoff: number | null | undefined): ResultFlag {
  if (value === null || Number.isNaN(value) || cutoff == null) return 'NORMAL';
  return value >= cutoff ? 'HIGH' : 'NORMAL';
}

/** The word printed beside a cut-off result: "Reactive" / "Non-reactive" unless the test says otherwise. */
export function interpretCutoff(
  value: number | null,
  cutoff: number | null | undefined,
  positiveLabel?: string | null,
  negativeLabel?: string | null,
): string | null {
  if (value === null || Number.isNaN(value) || cutoff == null) return null;
  return value >= cutoff ? (positiveLabel || 'Reactive') : (negativeLabel || 'Non-reactive');
}

/** True when the flag warrants an immediate callback to the clinician. */
export function isCritical(flag: ResultFlag): boolean {
  return flag === 'CRITICAL';
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Compute the full result set for a test: takes the entered raw values (keyed by
 * parameter CODE), evaluates calculated parameters via their formulas, and flags
 * every numeric value against the age/sex-appropriate reference range.
 *
 * Calculated parameters are evaluated in sortOrder so a calculated value may
 * depend on measured values (and earlier calculated values). Formula evaluation
 * is sandboxed (see expression.ts) — no arbitrary code can run.
 */
export function computeResultSet(
  params: ParameterDef[],
  rawByCode: Record<string, string>,
  patient: PatientContext,
): ComputedResult[] {
  const ordered = [...params].sort((a, b) => a.sortOrder - b.sortOrder);
  const numericContext: Record<string, number> = {};

  // First pass: measured values.
  for (const p of ordered) {
    if (p.valueType === 'CALCULATED') continue;
    const raw = (rawByCode[p.code] ?? '').trim();
    if ((p.valueType === 'NUMBER' || p.valueType === 'CUTOFF') && raw !== '') {
      const n = Number(raw);
      if (!Number.isNaN(n)) numericContext[p.code] = n;
    }
  }

  const results: ComputedResult[] = [];

  for (const p of ordered) {
    if (p.valueType === 'CALCULATED') {
      let numeric: number | null = null;
      let display: string | null = null;
      if (p.formula) {
        try {
          numeric = round2(evaluateExpression(p.formula.expression, numericContext));
          numericContext[p.code] = numeric; // allow later formulas to depend on it
          display = String(numeric);
        } catch {
          // Missing inputs / bad formula → leave blank rather than crash.
          numeric = null;
          display = null;
        }
      }
      results.push({
        parameterId: p.id,
        code: p.code,
        value: display,
        numericValue: numeric,
        flag: flagValue(numeric, pickRange(p.referenceRanges, patient)),
        isCalculated: true,
      });
    } else {
      const raw = (rawByCode[p.code] ?? '').trim();
      const numeric = (p.valueType === 'NUMBER' || p.valueType === 'CUTOFF') && raw !== '' ? Number(raw) : null;
      results.push({
        parameterId: p.id,
        code: p.code,
        value: raw === '' ? null : raw,
        numericValue: numeric !== null && !Number.isNaN(numeric) ? numeric : null,
        flag:
          p.valueType === 'NUMBER'
            ? flagValue(numeric, pickRange(p.referenceRanges, patient))
            : p.valueType === 'CUTOFF'
              ? cutoffFlag(numeric !== null && !Number.isNaN(numeric) ? numeric : null, p.cutoff)
              : 'NORMAL',
        isCalculated: false,
      });
    }
  }

  return results;
}
