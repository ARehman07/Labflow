import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  isTerminal,
  canEnterResults,
  InvalidTransitionError,
} from '../workflow';

describe('workflow state machine', () => {
  it('allows the core happy-path transitions', () => {
    expect(canTransition('BOOKED', 'SAMPLE_COLLECTED')).toBe(true);
    expect(canTransition('SAMPLE_COLLECTED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'RESULT_SAVED')).toBe(true);
    expect(canTransition('RESULT_SAVED', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVED', 'PRINTED')).toBe(true);
    expect(canTransition('PRINTED', 'DELIVERED')).toBe(true);
  });

  it('allows sending a saved result back for correction', () => {
    expect(canTransition('RESULT_SAVED', 'IN_PROGRESS')).toBe(true);
  });

  it('forbids skipping approval', () => {
    expect(canTransition('IN_PROGRESS', 'APPROVED')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'PRINTED')).toBe(false);
    expect(canTransition('RESULT_SAVED', 'PRINTED')).toBe(false);
  });

  it('forbids going backwards arbitrarily', () => {
    expect(canTransition('APPROVED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('DELIVERED', 'APPROVED')).toBe(false);
  });

  it('treats DELIVERED and CANCELLED as terminal', () => {
    expect(isTerminal('DELIVERED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('BOOKED')).toBe(false);
  });

  it('assertTransition throws on an illegal move', () => {
    expect(() => assertTransition('BOOKED', 'APPROVED')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('BOOKED', 'SAMPLE_COLLECTED')).not.toThrow();
  });

  it('permits result entry only at IN_PROGRESS or RESULT_SAVED', () => {
    expect(canEnterResults('IN_PROGRESS')).toBe(true);
    expect(canEnterResults('RESULT_SAVED')).toBe(true);
    expect(canEnterResults('BOOKED')).toBe(false);
    expect(canEnterResults('APPROVED')).toBe(false);
  });
});
