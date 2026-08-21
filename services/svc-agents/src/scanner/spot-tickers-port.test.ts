import { describe, expect, it } from 'vitest';
import { readLiveSpotTickers, type SpotTickersPort } from './spot-tickers-port.js';

const sample = {
  marketId: 'btc-usdt',
  last: '100',
  volume24h: '1000',
  change24hBps: 50,
  asOf: '2026-08-07T11:59:30.000Z',
  maxAgeMs: 120_000,
};

describe('readLiveSpotTickers', () => {
  it('unset port is no_live_tickers — not a fake quote board', async () => {
    const r = await readLiveSpotTickers(undefined);
    expect(r).toEqual({ ok: false, reason: 'no_live_tickers' });
  });

  it('empty sample is no_live_tickers — silence is not a zero-filled ticker', async () => {
    const port: SpotTickersPort = { sample: async () => [] };
    expect(await readLiveSpotTickers(port)).toEqual({ ok: false, reason: 'no_live_tickers' });
  });

  it('throwing sample is no_live_tickers', async () => {
    const port: SpotTickersPort = {
      sample: async () => {
        throw new Error('spot plane down');
      },
    };
    expect(await readLiveSpotTickers(port)).toEqual({ ok: false, reason: 'no_live_tickers' });
  });

  it('returns port samples when present', async () => {
    const port: SpotTickersPort = { sample: async () => [sample] };
    expect(await readLiveSpotTickers(port)).toEqual({ ok: true, tickers: [sample] });
  });
});
