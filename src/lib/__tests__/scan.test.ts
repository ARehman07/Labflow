import { describe, it, expect } from 'vitest';
import { parseScan } from '../scan';

describe('parseScan', () => {
  it('reads a tube barcode, including a retake', () => {
    expect(parseScan('00001-BLD-9W58')).toEqual({ kind: 'barcode', barcode: '00001-BLD-9W58', slipNo: '00001' });
    expect(parseScan(' 00012-ser-ab12-r1 ')).toEqual({ kind: 'barcode', barcode: '00012-SER-AB12-R1', slipNo: '00012' });
  });

  it('reads the slip QR payload', () => {
    expect(parseScan('LabFlow|Slip:00014|MR:MR-000002')).toEqual({ kind: 'slip', slipNo: '00014' });
    // The QR printed on a slip today is the portal link; it still scans as its visit.
    expect(parseScan('https://lab.example/portal?lab=ARFA&slip=00014'))
      .toEqual({ kind: 'slip', slipNo: '00014' });
    expect(parseScan('http://localhost:3007/portal?lab=ARFA&slip=7'))
      .toEqual({ kind: 'slip', slipNo: '00007' });
  });

  it('pads a slip number typed short', () => {
    expect(parseScan('14')).toEqual({ kind: 'slip', slipNo: '00014' });
    expect(parseScan('#00014')).toEqual({ kind: 'slip', slipNo: '00014' });
  });

  it('leaves names, MR numbers and mobiles to the normal search', () => {
    expect(parseScan('Sadia')).toBeNull();
    expect(parseScan('MR-000002')).toBeNull();
    expect(parseScan('03018765432')).toBeNull();
    expect(parseScan('')).toBeNull();
  });
});
