/**
 * What a scanner (or a person reading off a slip or tube) typed, as the visit
 * it points to.
 *
 * Three things reach a search box at the counter or the bench:
 *   - a tube label barcode, `00001-BLD-9W58` (a retake adds `-R1`);
 *   - the slip's QR, `LabFlow|Slip:00014|MR:MR-000002`;
 *   - a slip number read aloud, `14` or `00014`.
 * Each carries the slip number, so all three land on the same visit. Anything
 * else is left to the ordinary name / MR# / mobile search.
 */
export type ScanMatch =
  | { kind: 'barcode'; barcode: string; slipNo: string }
  | { kind: 'slip'; slipNo: string };

const BARCODE = /^(\d{5})-[A-Z]{3}-[A-Z0-9]{4}(?:-R\d+)?$/u;
const SLIP_QR = /(?:^|\|)Slip:(\d{1,6})(?:\||$)/u;
const SLIP_NO = /^#?(\d{1,6})$/u;

const pad = (n: string) => n.padStart(5, '0');

export function parseScan(raw: string): ScanMatch | null {
  const q = raw.trim();
  if (!q) return null;
  const upper = q.toUpperCase();
  const bc = BARCODE.exec(upper);
  if (bc) return { kind: 'barcode', barcode: upper, slipNo: bc[1] };
  const qr = SLIP_QR.exec(q);
  if (qr) return { kind: 'slip', slipNo: pad(qr[1]) };
  const no = SLIP_NO.exec(q);
  // Eleven digits is a mobile number, not a slip; the pattern already stops at
  // six, so a phone number never reads as one.
  if (no) return { kind: 'slip', slipNo: pad(no[1]) };
  return null;
}
