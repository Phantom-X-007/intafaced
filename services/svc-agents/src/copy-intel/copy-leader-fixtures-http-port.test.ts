import { describe, expect, it } from 'vitest';
import { createHttpCopyLeaderFixturesPort } from './copy-leader-fixtures-http-port.js';

describe('createHttpCopyLeaderFixturesPort', () => {
  it('returns fixtures when trade responds ok', async () => {
    const fixture = {
      leaderId: 'L1',
      realisedPnl: '100.5',
      closedTrades: 10,
      winningTrades: 6,
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2026-01-02T00:00:00.000Z',
      source: 'trade.copy',
    };
    const fetchImpl = async () =>
      new Response(JSON.stringify({ ok: true, fixtures: [fixture] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const port = createHttpCopyLeaderFixturesPort({
      tradeUrl: 'http://trade.test',
      internalSecret: 'a-copy-leader-http-port-internal-secret-long',
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(await port.sample()).toEqual([fixture]);
  });

  it('returns empty on refuse body', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ ok: false, reason: 'no_live_leaders' }), { status: 503 });

    const port = createHttpCopyLeaderFixturesPort({
      tradeUrl: 'http://trade.test',
      internalSecret: 'a-copy-leader-http-port-internal-secret-long',
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(await port.sample()).toEqual([]);
  });
});
