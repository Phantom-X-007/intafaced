/**
 * Unit card — whale flow mark (allow-list + sourced volume, never invent)
 * 1. Promise: v22.alerts whale kind — refuse `alerts.whale_mark_dark` without
 *    a sourced flow; fire only when env allow-list + ticker volume exist
 * 2. Break: reuse price mid/last as volume; empty allow-list quotes ok; missing
 *    volume becomes `'0'`
 * 3. Done bar: dark source; allow-list miss → unavailable; quoteVolume else
 *    baseVolume; empty/zero volume refuses
 * 4. Class N
 * 5. Paths: services/svc-notify/src/alerts/whale-mark.ts
 * 6. RED: this suite
 * 7. Collision: none
 */

import { describe, expect, it, vi } from 'vitest';
import { createDarkWhaleMarkSource, createTradeHttpWhaleMarkSource, flowFromTicker, parseWhaleFlowAllowlist } from './whale-mark.js';

const MARKET_ID = '11111111-1111-1111-1111-111111111111';
const SYMBOL = 'BTC/USDT';
const OTHER_ID = '22222222-2222-2222-8222-222222222222';

describe('parseWhaleFlowAllowlist', () => {
  it('blank / unset is empty — never a wildcard all-markets claim', () => {
    expect(parseWhaleFlowAllowlist(undefined)).toEqual([]);
    expect(parseWhaleFlowAllowlist(null)).toEqual([]);
    expect(parseWhaleFlowAllowlist('')).toEqual([]);
    expect(parseWhaleFlowAllowlist('  ,  ')).toEqual([]);
  });

  it('splits, trims, and dedupes exact market ids', () => {
    expect(parseWhaleFlowAllowlist(`${MARKET_ID}, ${OTHER_ID},${MARKET_ID}`)).toEqual([MARKET_ID, OTHER_ID]);
  });
});

describe('flowFromTicker — sourced volume, never invent', () => {
  it('prefers quoteVolume, falls back to baseVolume, refuses empty/zero', () => {
    expect(flowFromTicker({ quoteVolume: '1500.5', baseVolume: '9' })).toBe('1500.5');
    expect(flowFromTicker({ quoteVolume: null, baseVolume: '9' })).toBe('9');
    expect(flowFromTicker({ quoteVolume: null, baseVolume: null })).toBeNull();
    expect(flowFromTicker({ quoteVolume: '0', baseVolume: '0' })).toBeNull();
  });
});

describe('createDarkWhaleMarkSource', () => {
  it('is dark wiring and quotes unavailable — never an invented flow', async () => {
    const marks = createDarkWhaleMarkSource();
    expect(marks.kind).toBe('dark');
    const q = await marks.quote(MARKET_ID);
    expect(q).toMatchObject({ kind: 'unavailable', reason: 'dark' });
  });
});

describe('createTradeHttpWhaleMarkSource', () => {
  it('quotes sourced volume for an allow-listed market and refuses the rest', async () => {
    const now = new Date('2026-08-23T00:00:00Z');
    const fetchImpl = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/api/v1/markets')) {
        return new Response(JSON.stringify([{ id: MARKET_ID, symbol: SYMBOL }]), { status: 200 });
      }
      if (u.includes('/api/v1/ticker/')) {
        return new Response(JSON.stringify({ quoteVolume: '2500', last: '101', timestamp: now.getTime() }), { status: 200 });
      }
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;

    const marks = createTradeHttpWhaleMarkSource({
      baseUrl: 'http://trade.test/',
      allowlist: [MARKET_ID],
      fetchImpl,
    });
    expect(marks.kind).toBe('live');
    expect(await marks.quote(MARKET_ID, now)).toEqual({ kind: 'ok', price: '2500', at: now });
    const skipped = await marks.quote(OTHER_ID, now);
    expect(skipped.kind).toBe('unavailable');
    if (skipped.kind === 'unavailable') expect(skipped.reason).toBe('dark');
  });

  it('refuses a ticker with price but no volume — never treats last as flow', async () => {
    const now = new Date('2026-08-23T00:00:00Z');
    const fetchImpl = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/api/v1/markets')) {
        return new Response(JSON.stringify([{ id: MARKET_ID, symbol: SYMBOL }]), { status: 200 });
      }
      return new Response(JSON.stringify({ bid: '100', ask: '102', last: '101', timestamp: now.getTime() }), { status: 200 });
    }) as unknown as typeof fetch;

    const marks = createTradeHttpWhaleMarkSource({
      baseUrl: 'http://trade.test',
      allowlist: [MARKET_ID],
      fetchImpl,
    });
    const q = await marks.quote(MARKET_ID, now);
    expect(q.kind).toBe('unavailable');
    if (q.kind === 'unavailable') {
      expect(q.detail).toMatch(/quoteVolume\/baseVolume/);
    }
  });
});
