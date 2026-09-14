import { describe, it, expect } from 'vitest';
import { DOCUMENT_VARS, STARTER_TEMPLATES, fillDocument } from '../templates';

describe('fillDocument', () => {
  it('fills placeholders and keeps paragraphs', () => {
    expect(fillDocument('Dear {patient},\n\nMR# {mr}', { patient: 'Ali', mr: 'MR-1' })).toBe('Dear Ali,\n\nMR# MR-1');
  });

  it('leaves an unknown placeholder visible', () => {
    expect(fillDocument('Hello {nmae}', { patient: 'Ali' })).toBe('Hello {nmae}');
  });
});

describe('starter templates', () => {
  it('only use placeholders a document can fill', () => {
    for (const tpl of STARTER_TEMPLATES) {
      for (const m of tpl.body.matchAll(/\{(\w+)\}/g)) expect(DOCUMENT_VARS as readonly string[]).toContain(m[1]);
    }
  });
});
