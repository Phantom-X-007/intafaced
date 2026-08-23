import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import {
  LEVERAGE_INVALID,
  LEVERAGE_TOO_HIGH,
  checkLeverage,
  initialMargin,
  parseConfiguredMaxLeverage,
  resolveMaxLeverage,
} from './initial-margin.js';
import { TEST_MAX_LEVERAGE } from './initial-margin.test-harness.js';

describe('initialMargin', () => {
  it('1 BTC at 50_000 with 10x → 5_000 quote units (scaled)', () => {
    const m = initialMargin({
      size: parseAmount('1'),
      entryPrice: parseAmount('50000'),
      leverage: parseAmount('10'),
    });
    expect(m).toBe(parseAmount('5000'));
  });

  it('refuses zero leverage', () => {
    expect(() =>
      initialMargin({
        size: parseAmount('1'),
        entryPrice: parseAmount('100'),
        leverage: parseAmount('0'),
      }),
    ).toThrow(/leverage/);
  });
});

describe('resolveMaxLeverage', () => {
  const amt = parseAmount;

  it('unset / non-positive configuration remains unset rather than inventing 10x', () => {
    expect(resolveMaxLeverage()).toBeNull();
    expect(resolveMaxLeverage(null)).toBeNull();
    expect(resolveMaxLeverage(0n)).toBeNull();
    expect(parseConfiguredMaxLeverage('')).toBeNull();
    expect(parseConfiguredMaxLeverage('  ')).toBeNull();
    expect(resolveMaxLeverage(parseConfiguredMaxLeverage(''))).toBeNull();
  });

  it('honours a named positive owner cap', () => {
    expect(resolveMaxLeverage(amt('5'))).toBe(amt('5'));
    expect(parseConfiguredMaxLeverage('5')).toBe(amt('5'));
    expect(resolveMaxLeverage(amt(TEST_MAX_LEVERAGE))).toBe(amt(TEST_MAX_LEVERAGE));
    expect(parseConfiguredMaxLeverage(TEST_MAX_LEVERAGE)).toBe(amt(TEST_MAX_LEVERAGE));
  });

  it('does not substitute an agent-owned ceiling for an explicit owner value', () => {
    expect(parseConfiguredMaxLeverage('20')).toBe(amt('20'));
    expect(resolveMaxLeverage(amt('20'))).toBe(amt('20'));
  });
});

describe('checkLeverage', () => {
  const amt = parseAmount;
  const cap = amt(TEST_MAX_LEVERAGE);

  it('admits the range this repository actually trades, and refuses above a named cap', () => {
    for (const ok of ['0.5', '1', '2', '5', '10']) expect(checkLeverage(amt(ok), cap)).toEqual({ ok: true });
    expect(checkLeverage(amt('10.01'), cap).code).toBe(LEVERAGE_TOO_HIGH);
    expect(checkLeverage(amt('100'), cap).code).toBe(LEVERAGE_TOO_HIGH);
    expect(checkLeverage(amt('100000'), cap).code).toBe(LEVERAGE_TOO_HIGH);
  });

  it('refuses the value that used to reach Postgres and raise 22003', () => {
    const check = checkLeverage(amt('1000000'), cap);
    expect(check.ok).toBe(false);
    expect(check.code).toBe(LEVERAGE_TOO_HIGH);
    expect(check.reason).toMatch(/1000000x exceeds the maximum of 10x/);
  });

  it('separates "not a leverage" from "too much leverage"', () => {
    expect(checkLeverage(amt('0'), cap).code).toBe(LEVERAGE_INVALID);
    expect(checkLeverage(-1n, cap).code).toBe(LEVERAGE_INVALID);
  });

  it('honours an owner-set maximum without any call site changing', () => {
    expect(checkLeverage(amt('50'), amt('100'))).toEqual({ ok: true });
    expect(checkLeverage(amt('50'), amt('20')).code).toBe(LEVERAGE_TOO_HIGH);
  });
});
