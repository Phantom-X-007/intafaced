/**
 * Unit card — v22.alerts MVP evaluate
 * 1. Promise: tracker v22.alerts + §31 — dark sources refuse; no invent
 * 2. Break: fire on null mark / silent drop when dark
 * 3. Done bar: unavailable → refuse; cross → fire; hold otherwise; no number money
 * 4. Class N (pure; no money movement)
 * 5. Paths: services/svc-notify/src/alerts/**
 * 6. RED first: dark quote must not fire
 * 7. Collision: none (new files)
 */

import { describe, expect, it } from 'vitest';
import { compareDecimalStrings, isValidPositivePrice } from './decimal.js';
import { evaluatePriceAlert } from './evaluate.js';
import type { PriceAlert } from './types.js';

const base: PriceAlert = {
  id: '00000000-0000-4000-8000-000000000001',
  userId: 'user-1',
  marketId: 'BTC-USD',
  direction: 'above',
  targetPrice: '100.5',
  status: 'active',
  firedAt: null,
  createdAt: new Date('2026-08-09T00:00:00Z'),
};

describe('decimal string compare — no JS number', () => {
  it('orders magnitudes without floating point', () => {
    expect(compareDecimalStrings('99.9', '100')).toBe(-1);
    expect(compareDecimalStrings('100.0', '100')).toBe(0);
    expect(compareDecimalStrings('100.01', '100')).toBe(1);
    expect(compareDecimalStrings('1000', '999')).toBe(1);
    expect(compareDecimalStrings('0.001', '0.01')).toBe(-1);
  });

  it('rejects non-prices as targets', () => {
    expect(isValidPositivePrice('0')).toBe(false);
    expect(isValidPositivePrice('-1')).toBe(false);
    expect(isValidPositivePrice('1e3')).toBe(false);
    expect(isValidPositivePrice('100.5')).toBe(true);
  });
});

describe('evaluatePriceAlert — dark refuse + cross fire', () => {
  it('refuses a dark mark and never fires', () => {
    const out = evaluatePriceAlert(base, { kind: 'unavailable', reason: 'dark' });
    expect(out).toEqual({
      kind: 'refuse',
      code: 'alert.price_unavailable',
      detail: 'dark',
    });
  });

  it('refuses stale and refused marks the same way', () => {
    expect(evaluatePriceAlert(base, { kind: 'unavailable', reason: 'stale', detail: 'mark age > 30s' }).kind).toBe('refuse');
    expect(evaluatePriceAlert(base, { kind: 'unavailable', reason: 'refused' }).kind).toBe('refuse');
  });

  it('fires when mark is at or above target for direction=above', () => {
    expect(evaluatePriceAlert(base, { kind: 'ok', price: '100.5', at: new Date() })).toEqual({
      kind: 'fire',
      markPrice: '100.5',
    });
    expect(evaluatePriceAlert(base, { kind: 'ok', price: '101', at: new Date() }).kind).toBe('fire');
  });

  it('holds when mark is still below an above-target', () => {
    expect(evaluatePriceAlert(base, { kind: 'ok', price: '100.49', at: new Date() })).toEqual({
      kind: 'hold',
      markPrice: '100.49',
    });
  });

  it('fires below-target when mark drops to or under', () => {
    const below: PriceAlert = { ...base, direction: 'below', targetPrice: '50' };
    expect(evaluatePriceAlert(below, { kind: 'ok', price: '50', at: new Date() }).kind).toBe('fire');
    expect(evaluatePriceAlert(below, { kind: 'ok', price: '49.9', at: new Date() }).kind).toBe('fire');
    expect(evaluatePriceAlert(below, { kind: 'ok', price: '50.1', at: new Date() }).kind).toBe('hold');
  });

  it('refuses inactive / already-fired / cancelled rather than re-firing', () => {
    for (const status of ['fired', 'cancelled'] as const) {
      const out = evaluatePriceAlert({ ...base, status }, { kind: 'ok', price: '999', at: new Date() });
      expect(out).toMatchObject({ kind: 'refuse', code: 'alert.not_active' });
    }
  });

  it('refuses a garbage mark string instead of inventing a fire', () => {
    const out = evaluatePriceAlert(base, { kind: 'ok', price: 'n/a', at: new Date() });
    expect(out.kind).toBe('refuse');
    if (out.kind === 'refuse') expect(out.code).toBe('alert.price_unavailable');
  });
});
