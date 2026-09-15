/**
 * Which earlier results a report shows beside today's, kept free of the
 * database so the rules can be tested on their own.
 *
 * A patient's earlier values are found through the analyte, not the test: a
 * cholesterol booked on its own last spring and the one inside today's lipid
 * profile are the same measurement. A parameter with no analyte code only ever
 * matches itself, which is how history worked before codes existed.
 */

/** How a parameter is recognised across tests. */
export function analyteKey(p: { id: string; analyteCode?: string | null }): string {
  const code = p.analyteCode?.trim().toUpperCase();
  return code ? `A:${code}` : `P:${p.id}`;
}

export interface EarlierRow {
  /** analyteKey of the parameter the value was recorded against. */
  key: string;
  value: string | null;
  flag: string;
  unit: string | null;
  visit: { id: string; slipNo: string; bookedAt: Date };
}

export interface PickedColumn {
  visitId: string;
  slipNo: string;
  bookedAt: Date;
}

/**
 * The earlier visits shown as columns for one test, and the value in each cell.
 *
 * Columns come only from visits that have a value for something printed today,
 * so a column is never blank from top to bottom. `rows` must be newest first;
 * when one visit recorded the same analyte twice (a standalone test and a
 * profile on the same slip) the first — newest — wins.
 */
export function pickHistory(printedKeys: string[], rows: EarlierRow[], limit: number) {
  const wanted = new Set(printedKeys);
  const mine = rows.filter((r) => wanted.has(r.key) && r.value != null && r.value.trim() !== '');

  const columns: PickedColumn[] = [];
  const seen = new Set<string>();
  for (const r of mine) {
    if (columns.length >= limit) break;
    if (seen.has(r.visit.id)) continue;
    seen.add(r.visit.id);
    columns.push({ visitId: r.visit.id, slipNo: r.visit.slipNo, bookedAt: r.visit.bookedAt });
  }

  const cell = new Map<string, EarlierRow>();
  for (const r of mine) {
    const k = `${r.visit.id}:${r.key}`;
    if (!cell.has(k)) cell.set(k, r);
  }
  return { columns, cell };
}

/** The oldest booking date history may reach back to, or null for no limit. */
export function historyCutoff(from: Date, months: number): Date | null {
  if (!Number.isFinite(months) || months <= 0) return null;
  const d = new Date(from);
  d.setMonth(d.getMonth() - months);
  return d;
}

/** "mg/dL" and "mg/dl " are one unit; a value in mmol/L is not comparable to either. */
export function sameUnit(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (u: string | null | undefined) => (u ?? '').replace(/\s+/g, '').toLowerCase();
  return norm(a) === norm(b);
}
