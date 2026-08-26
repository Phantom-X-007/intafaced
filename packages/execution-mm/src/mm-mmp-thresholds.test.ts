import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { EXECUTION_MM_MMP_THRESHOLDS_ENV, evaluateMmMmpTrigger, mmMmpThresholdsGate, runMmMmpAction } from './mm-mmp-thresholds.js';

const SAMPLE = JSON.stringify({
  maxFilledQuantity: '10',
  maxFilledDelta: 100,
  maxFilledVega: 50,
  maxOpenQuotes: 20,
  observationWindowMs: 1000,
});

const INSIDE = {
  filledQuantity: parseAmount('1'),
  filledDelta: 0,
  filledVega: 0,
  openQuotes: 1,
} as const;

describe('MM MMP owner thresholds gate', () => {
  it('refuses when env is unset', () => {
    expect(mmMmpThresholdsGate({})).toEqual({
      configured: false,
      reason: 'mmp_thresholds_unset',
      detail: `${EXECUTION_MM_MMP_THRESHOLDS_ENV} is unset`,
    });
  });

  it('refuses blank env the same way', () => {
    expect(mmMmpThresholdsGate({ [EXECUTION_MM_MMP_THRESHOLDS_ENV]: '   ' }).configured).toBe(false);
  });

  it('parses owner JSON thresholds without inventing defaults', () => {
    const gate = mmMmpThresholdsGate({ [EXECUTION_MM_MMP_THRESHOLDS_ENV]: SAMPLE });
    expect(gate.configured).toBe(true);
    if (!gate.configured) throw new Error('expected configured MMP thresholds');
    expect(gate.thresholds).toEqual({
      maxFilledQuantity: parseAmount('10'),
      maxFilledDelta: 100,
      maxFilledVega: 50,
      maxOpenQuotes: 20,
      observationWindowMs: 1000,
    });
  });

  it('refuses incomplete owner JSON', () => {
    const gate = mmMmpThresholdsGate({
      [EXECUTION_MM_MMP_THRESHOLDS_ENV]: JSON.stringify({ maxFilledDelta: 1 }),
    });
    expect(gate).toMatchObject({ configured: false, reason: 'mmp_thresholds_incomplete' });
  });
});

describe('MMP actions refuse-closed when thresholds unset', () => {
  it.each(['mass_quote', 'freeze', 'reset'] as const)('refuses %s when owner thresholds are unset', (action) => {
    const result = runMmMmpAction(action, {});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('mmp_thresholds_unset');
    expect(result.action).toBe(action);
    expect(result.detail).toMatch(/unset/);
  });

  it('enables mass quote once owner thresholds are set (no invented numbers)', () => {
    const result = runMmMmpAction('mass_quote', { [EXECUTION_MM_MMP_THRESHOLDS_ENV]: SAMPLE });
    expect(result.ok).toBe(true);
  });

  it('admits mass quote when owner thresholds are set and observation is inside', () => {
    const result = runMmMmpAction('mass_quote', { [EXECUTION_MM_MMP_THRESHOLDS_ENV]: SAMPLE }, INSIDE);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected admit');
    expect(result.action).toBe('mass_quote');
  });

  it('fences mass quote when an owner maximum is exceeded', () => {
    const result = runMmMmpAction(
      'mass_quote',
      { [EXECUTION_MM_MMP_THRESHOLDS_ENV]: SAMPLE },
      { ...INSIDE, filledQuantity: parseAmount('11') },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fence');
    expect(result.reason).toBe('mmp_triggered');
  });

  it('refuses freeze/reset/mass_quote observation gaps rather than assuming zero greeks', () => {
    const result = runMmMmpAction('mass_quote', { [EXECUTION_MM_MMP_THRESHOLDS_ENV]: SAMPLE }, { ...INSIDE, filledDelta: null });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('mmp_observation_incomplete');
  });
});

describe('evaluateMmMmpTrigger', () => {
  it('clears inside owner maxima', () => {
    const gate = mmMmpThresholdsGate({ [EXECUTION_MM_MMP_THRESHOLDS_ENV]: SAMPLE });
    if (!gate.configured) throw new Error('expected configured MMP thresholds');
    expect(evaluateMmMmpTrigger(gate.thresholds, INSIDE)).toEqual({ triggered: false });
  });
});
