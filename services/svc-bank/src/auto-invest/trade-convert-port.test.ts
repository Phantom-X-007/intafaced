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
import { tradeConvertPort, usableTradeConvertUrl } from './trade-convert-port.js';

const EDGE = 'a-bank-auto-invest-convert-edge-secret-32ch';
const USER = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

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
    expect(seen.some((u) => u.includes('/trpc/convert.quote'))).toBe(true);
    expect(seen.some((u) => u.includes('/trpc/convert.execute'))).toBe(true);
  });

  it('refuses by name when convert.quote fails — does not invent a price', async () => {
    const port = tradeConvertPort({
      baseUrl: 'http://svc-trade:4004',
      edgeSecret: EDGE,
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
});
