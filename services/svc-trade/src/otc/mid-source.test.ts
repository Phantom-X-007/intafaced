import { describe, expect, it } from 'vitest';
import { createConfigOtcMidSource, NO_OTC_MIDS, otcPairKey } from './mid-source.js';

describe('otc mid-source', () => {
  it('pair key is upper-cased BASE/QUOTE, matching trade.markets.symbol', () => {
    expect(otcPairKey('btc', 'usdt')).toBe('BTC/USDT');
    expect(otcPairKey(' eth ', ' usd ')).toBe('ETH/USD');
  });

  it('the production default sources nothing', async () => {
    expect(await NO_OTC_MIDS('BTC/USDT')).toBeNull();
  });

  it('blank env sources nothing — no zero, no invent', async () => {
    const src = createConfigOtcMidSource('');
    expect(await src('BTC/USDT')).toBeNull();
    expect(await createConfigOtcMidSource(undefined)('BTC/USDT')).toBeNull();
  });

  it('reads an ops-published mid, and only for the pair published', async () => {
    const src = createConfigOtcMidSource('BTC/USDT:65000,ETH/USDT:3200');
    expect(await src('BTC/USDT')).toBe('65000');
    expect(await src('ETH/USDT')).toBe('3200');
    expect(await src('SOL/USDT')).toBeNull();
  });
});
