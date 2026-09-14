import { describe, it, expect } from 'vitest';
import { FEATURE_KEYS, normaliseFeatures, parseFeatures } from '../catalog';

describe('lab features', () => {
  it('has everything on for a new lab', () => {
    const f = parseFeatures('{}');
    expect(FEATURE_KEYS.every((k) => f[k])).toBe(true);
  });

  it('keeps what the lab switched off and ignores unknown keys', () => {
    const f = parseFeatures(JSON.stringify({ 'booking.b2b': false, 'lab.queue': false, 'made.up': false }));
    expect(f['booking.b2b']).toBe(false);
    expect(f['lab.queue']).toBe(false);
    expect(f['booking.packages']).toBe(true);
    expect('made.up' in f).toBe(false);
  });

  it('never switches off every way of taking a sample', () => {
    const f = normaliseFeatures({ 'booking.sampleInLab': false, 'booking.sampleOutside': false, 'booking.sampleHome': false, 'booking.sampleExisting': false });
    expect(f['booking.sampleInLab']).toBe(true);
  });

  it('survives a corrupt stored value', () => {
    expect(parseFeatures('not json')['lab.qc']).toBe(true);
  });
});
