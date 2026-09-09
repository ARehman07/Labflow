/** Human-friendly identifier generators. Kept simple & sequential for a single
 *  lab; uniqueness is enforced by DB constraints. */

export function formatMrNo(seq: number): string {
  return `MR-${String(seq).padStart(6, '0')}`;
}

export function formatSlipNo(seq: number): string {
  return String(seq).padStart(5, '0');
}

export function formatBarcode(visitSeq: number, lineSeq: number): string {
  return `${String(visitSeq).padStart(6, '0')}-${lineSeq}`;
}
