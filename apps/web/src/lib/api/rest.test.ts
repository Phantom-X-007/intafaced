import { describe, expect, it, vi } from 'vitest';
import { createEdgeClient } from './edge-client';
import { fetchAccountBalance, fetchOhlcv } from './rest';

describe('CCXT REST helpers', () => {
  it('parses OHLCV decimal-string rows', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([
        [1_700_000_000_000, '100', '105', '99', '104', '12.5'],
        [1_700_000_060_000, '104', '106', '103', '105', '3'],
      ]),
    );
    const edge = createEdgeClient({ baseUrl: 'http://edge.test', fetch: fetchImpl });
    const result = await fetchOhlcv(edge, 'BTC/USDT', { timeframe: '1m', limit: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]![1]).toBe('100');
    expect(typeof result.value[0]![5]).toBe('string');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://edge.test/api/v1/ohlcv/BTC%2FUSDT?timeframe=1m&limit=2',
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }),
    );
  });

  it('returns honest empty candles when the venue has never traded', async () => {
    const fetchImpl = vi.fn(async () => Response.json([]));
    const edge = createEdgeClient({ baseUrl: 'http://edge.test', fetch: fetchImpl });
    const result = await fetchOhlcv(edge, 'ETH/USDT');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('requires sign-in for account balance and projects free/used/total strings', async () => {
    const edge = createEdgeClient({ baseUrl: 'http://edge.test', token: () => 'tok', fetch: vi.fn() });
    const anon = await fetchAccountBalance(edge, false);
    expect(anon.ok).toBe(false);
    if (anon.ok) return;
    expect(anon.reason).toBe('unauthenticated');

    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      return Response.json({
        timestamp: 1,
        datetime: '2026-07-31T00:00:00.000Z',
        balances: { USDT: { free: '10', used: '2', total: '12' } },
      });
    });
    const authed = createEdgeClient({ baseUrl: 'http://edge.test', token: () => 'tok', fetch: fetchImpl });
    const result = await fetchAccountBalance(authed, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.balances.USDT?.total).toBe('12');
  });
});
