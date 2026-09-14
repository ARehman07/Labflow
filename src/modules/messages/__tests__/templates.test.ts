import { describe, it, expect } from 'vitest';
import { DEFAULT_TEMPLATES, EVENT_VARS, MESSAGE_EVENTS, renderTemplate, smsParts, money } from '../templates';

describe('renderTemplate', () => {
  it('fills known placeholders', () => {
    expect(renderTemplate('Dear {patient}, slip #{slip}', { patient: 'Ali', slip: '00012' })).toBe('Dear Ali, slip #00012');
  });

  it('blanks a known placeholder with no value and tidies the gap', () => {
    expect(renderTemplate('Ref {ref} done', { ref: null })).toBe('Ref done');
  });

  it('leaves an unknown placeholder as typed', () => {
    expect(renderTemplate('Dear {patinet}', { patient: 'Ali' })).toBe('Dear {patinet}');
  });
});

describe('smsParts', () => {
  it('counts plain text at 160 per SMS, then 153', () => {
    expect(smsParts('a'.repeat(160))).toBe(1);
    expect(smsParts('a'.repeat(161))).toBe(2);
    expect(smsParts('a'.repeat(306))).toBe(2);
    expect(smsParts('a'.repeat(307))).toBe(3);
  });

  it('counts Urdu at 70 per SMS, then 67', () => {
    expect(smsParts('ر'.repeat(70))).toBe(1);
    expect(smsParts('ر'.repeat(71))).toBe(2);
  });

  it('is zero for an empty message', () => {
    expect(smsParts('')).toBe(0);
  });
});

describe('default templates', () => {
  it('only use placeholders their event provides', () => {
    for (const event of MESSAGE_EVENTS) {
      const used = [...DEFAULT_TEMPLATES[event].matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const key of used) expect(EVENT_VARS[event]).toContain(key);
    }
  });
});

describe('money', () => {
  it('rounds and groups thousands', () => {
    expect(money(2400.4)).toBe('2,400');
  });
});
