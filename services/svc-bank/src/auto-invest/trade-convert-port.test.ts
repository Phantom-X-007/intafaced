/**
 * Unit card — bank.auto-invest ConvertPort HTTP adapter (trade.convert)
 *
 * 1. Promise: DCA convert amounts come from trade.convert; bank invents no mid.
 * 2. Break: quote/execute failure or missing market still returns a fill.
 * 3. Done bar: mock quote+execute settles to trade's filled/userNotional;
 *    convert failure throws bank.auto_invest_rate_unset (no invented price);
 *    usableTradeConvertUrl rejects empty/non-http.
 * 4. Class M
 * 5. Paths: services/svc-bank/src/auto-invest/**
 * 6. RED first: this suite
 * 7. Collision: #2194 compose / #2202 index affiliate — this file is new
 */
import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { BankError } from '../errors.js';
import { assertConvertMarketsListLimit, tradeConvertPort, usableTradeConvertUrl } from './trade-convert-port.js';

const EDGE = 'a-bank-auto-invest-convert-edge-secret-32ch';
const USER = '11111111-1111-4111-8111-111111111111';
/** Explicit owner-published window — 50 is allowed when passed, never as a silent default. */
const MARKETS_LIMIT = 50;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('assertConvertMarketsListLimit', () => {
  it('refuses blank / NaN / 0 / 501 — never invent 50', () => {
    for (const bad of [undefined, Number.NaN, 0, 501, 1.5] as const) {
      expect(() => assertConvertMarketsListLimit(bad)).toThrow(BankError);
    }
    try {
      assertConvertMarketsListLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(BankError);
      expect((e as BankError).code).toBe('bank.convert_markets_limit_unset');
      expect((e as BankError).message).not.toMatch(/default 50|50-row/i);
    }
  });

  it('accepts owner-published 50 and 500', () => {
    expect(assertConvertMarketsListLimit(50)).toBe(50);
    expect(assertConvertMarketsListLimit(1)).toBe(1);
    expect(assertConvertMarketsListLimit(500)).toBe(500);
  });
});

describe('usableTradeConvertUrl', () => {
  it('accepts http(s) TRADE_URL and rejects empty / non-http', () => {
    expect(usableTradeConvertUrl('http://svc-trade:4004')).toBe(true);
    expect(usableTradeConvertUrl('https://trade.example')).toBe(true);
    expect(usableTradeConvertUrl('')).toBe(false);
    expect(usableTradeConvertUrl(undefined)).toBe(false);
    expect(usableTradeConvertUrl('not-a-url')).toBe(false);
    expect(usableTradeConvertUrl('ftp://svc-trade:4004')).toBe(false);
  });
});

describe('tradeConvertPort — amounts from trade, never a bank mid', () => {
  it('buy path returns convert execute filled qty (decimal strings on the wire)', async () => {
    const seen: string[] = [];
    const port = tradeConvertPort({
      baseUrl: 'http://svc-trade:4004',
      edgeSecret: EDGE,
      marketsLimit: MARKETS_LIMIT,
      fetchImpl: async (input) => {
        const url = String(input);
        seen.push(url);
        if (url.includes('/api/v1/markets')) {
          return jsonResponse(200, [
            {
              symbol: 'BTC/USDT',
              base: 'BTC',
              quote: 'USDT',
              spot: true,
              active: true,
              limits: { amount: { min: '0.001' } },
            },
          ]);
        }
        if (url.includes('/trpc/convert.quote')) {
          return jsonResponse(200, {
            result: {
              data: {
                symbol: 'BTC/USDT',
                side: 'buy',
                requestedQty: '0.002',
                filledQty: '0.002',
                userNotional: '100',
                avgPrice: '50000',
                fullyFilled: true,
                convertSpreadBps: 10,
                expiresAt: '2026-08-16T12:00:00.000Z',
              },
            },
          });
        }
        if (url.includes('/trpc/convert.execute')) {
          return jsonResponse(200, {
            result: {
              data: {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                filled: '0.002',
                remaining: '0',
                status: 'filled',
              },
            },
          });
        }
        return jsonResponse(404, { error: { message: 'unexpected' } });
      },
    });

    const result = await port.convert({
      userId: USER,
      fromAsset: 'USDT',
      toAsset: 'BTC',
      fromAmount: parseAmount('100'),
      clientConvertId: 'dca-test-1',
    });

    expect(formatAmount(result.toAmount)).toBe('0.002');
    expect(result.ledgerTxId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(seen).toContain(`http://svc-trade:4004/api/v1/markets?limit=${MARKETS_LIMIT}`);
    expect(seen.some((u) => u.includes('/trpc/convert.quote'))).toBe(true);
    expect(seen.some((u) => u.includes('/trpc/convert.execute'))).toBe(true);
  });

  it('refuses by name when convert.quote fails — does not invent a price', async () => {
    const port = tradeConvertPort({
      baseUrl: 'http://svc-trade:4004',
      edgeSecret: EDGE,
      marketsLimit: MARKETS_LIMIT,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/api/v1/markets')) {
          return jsonResponse(200, [
            { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', spot: true, active: true, limits: { amount: { min: '0.001' } } },
          ]);
        }
        return jsonResponse(400, {
          error: { message: 'insufficient book depth', data: { intafacedCode: 'trade.convert_insufficient_depth' } },
        });
      },
    });

    await expect(
      port.convert({
        userId: USER,
        fromAsset: 'USDT',
        toAsset: 'BTC',
        fromAmount: parseAmount('100'),
        clientConvertId: 'dca-fail-1',
      }),
    ).rejects.toMatchObject({ code: 'bank.auto_invest_rate_unset' });
  });

  it('refuses when execute fills nothing rather than substituting a ticker mid', async () => {
    const port = tradeConvertPort({
      baseUrl: 'http://svc-trade:4004',
      edgeSecret: EDGE,
      marketsLimit: MARKETS_LIMIT,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/api/v1/markets')) {
          return jsonResponse(200, [
            { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', spot: true, active: true, limits: { amount: { min: '0.001' } } },
          ]);
        }
        if (url.includes('/trpc/convert.quote')) {
          return jsonResponse(200, {
            result: {
              data: {
                symbol: 'BTC/USDT',
                side: 'buy',
                requestedQty: '0.002',
                filledQty: '0.002',
                userNotional: '100',
                avgPrice: '50000',
                fullyFilled: true,
              },
            },
          });
        }
        return jsonResponse(200, {
          result: { data: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', filled: '0', remaining: '0.002', status: 'cancelled' } },
        });
      },
    });

    await expect(
      port.convert({
        userId: USER,
        fromAsset: 'USDT',
        toAsset: 'BTC',
        fromAmount: parseAmount('100'),
        clientConvertId: 'dca-empty-fill',
      }),
    ).rejects.toMatchObject({ code: 'bank.auto_invest_rate_unset' });
  });

  it('omit marketsLimit refuses bank.convert_markets_limit_unset — never calls trade, never invents 50', async () => {
    let fetches = 0;
    const port = tradeConvertPort({
      baseUrl: 'http://svc-trade:4004',
      edgeSecret: EDGE,
      fetchImpl: async () => {
        fetches += 1;
        return jsonResponse(200, [{ symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', spot: true, active: true }]);
      },
    });

    await expect(
      port.convert({
        userId: USER,
        fromAsset: 'USDT',
        toAsset: 'BTC',
        fromAmount: parseAmount('100'),
        clientConvertId: 'dca-limit-unset',
      }),
    ).rejects.toMatchObject({ code: 'bank.convert_markets_limit_unset' });
    expect(fetches).toBe(0);
  });

  it('empty markets listing refuses rate_unset — does not fabricate a pair', async () => {
    const port = tradeConvertPort({
      baseUrl: 'http://svc-trade:4004',
      edgeSecret: EDGE,
      marketsLimit: MARKETS_LIMIT,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/api/v1/markets?limit=')) return jsonResponse(200, []);
        return jsonResponse(404, { error: { message: 'unexpected' } });
      },
    });

    await expect(
      port.convert({
        userId: USER,
        fromAsset: 'USDT',
        toAsset: 'BTC',
        fromAmount: parseAmount('100'),
        clientConvertId: 'dca-empty-markets',
      }),
    ).rejects.toMatchObject({ code: 'bank.auto_invest_rate_unset' });
  });

  it('listed pair missing refuses rate_unset — does not invent a convert market', async () => {
    const port = tradeConvertPort({
      baseUrl: 'http://svc-trade:4004',
      edgeSecret: EDGE,
      marketsLimit: MARKETS_LIMIT,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/api/v1/markets?limit=')) {
          return jsonResponse(200, [
            { symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT', spot: true, active: true, limits: { amount: { min: '0.001' } } },
          ]);
        }
        return jsonResponse(404, { error: { message: 'unexpected' } });
      },
    });

    await expect(
      port.convert({
        userId: USER,
        fromAsset: 'USDT',
        toAsset: 'BTC',
        fromAmount: parseAmount('100'),
        clientConvertId: 'dca-no-pair',
      }),
    ).rejects.toMatchObject({ code: 'bank.auto_invest_rate_unset' });
  });
});
