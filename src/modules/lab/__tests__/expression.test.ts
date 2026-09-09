import { describe, it, expect } from 'vitest';
import { evaluateExpression } from '../expression';

describe('evaluateExpression', () => {
  it('respects operator precedence', () => {
    expect(evaluateExpression('2 + 3 * 4', {})).toBe(14);
    expect(evaluateExpression('(2 + 3) * 4', {})).toBe(20);
  });

  it('handles subtraction chains left-to-right', () => {
    expect(evaluateExpression('10 - 3 - 2', {})).toBe(5);
  });

  it('handles division and decimals', () => {
    expect(evaluateExpression('TG / 5', { TG: 150 })).toBe(30);
    expect(evaluateExpression('7 / 2', {})).toBe(3.5);
  });

  it('handles unary minus', () => {
    expect(evaluateExpression('-5 + 3', {})).toBe(-2);
    expect(evaluateExpression('10 * -2', {})).toBe(-20);
  });

  it('evaluates the Friedewald LDL formula', () => {
    // LDL = Total - HDL - (TG / 5)
    expect(evaluateExpression('TCHOL - HDL - (TG / 5)', { TCHOL: 210, HDL: 45, TG: 150 })).toBe(135);
  });

  it('evaluates a ratio', () => {
    expect(evaluateExpression('TCHOL / HDL', { TCHOL: 210, HDL: 45 })).toBeCloseTo(4.6667, 3);
  });

  it('throws on a missing variable', () => {
    expect(() => evaluateExpression('A + B', { A: 1 })).toThrow(/Missing value for "B"/);
  });

  it('throws on division by zero', () => {
    expect(() => evaluateExpression('1 / 0', {})).toThrow(/Division by zero/);
  });

  it('throws on mismatched parentheses', () => {
    expect(() => evaluateExpression('(1 + 2', {})).toThrow(/parentheses/);
  });

  it('throws on unexpected characters', () => {
    expect(() => evaluateExpression('2 ^ 3', {})).toThrow(/Unexpected character/);
  });
});
