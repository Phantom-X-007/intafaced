import { describe, expect, it } from 'vitest';
import { createConfigOtcMidSource, NO_OTC_MIDS, otcPairKey } from './mid-source.js';

describe('otc mid-source', () => {
  it('pair key is upper-cased BASE/QUOTE, matching trade.markets.symbol', () => {
    expect(otcPairKey('btc', 'usdt')).toBe('BTC/USDT');
    expect(otcPairKey(' eth ', ' usd ')).toBe('ETH/USD');
  });

  it('an asset containing the separator is refused, not normalised', () => {
    // Otherwise ('BTC','USDT/X') and ('BTC/USDT','X') collide on one mid.
    expect(otcPairKey('BTC', 'USDT/X')).toBeNull();
    expect(otcPairKey('BTC/USDT', 'X')).toBeNull();
    expect(otcPairKey('', 'USDT')).toBeNull();
    expect(otcPairKey('BTC', '   ')).toBeNull();
  });

  it('drops an ops entry whose price is not a positive decimal', () => {
    // An ops typo must cost a refusal at boot, not surface to a customer.
    const src = createConfigOtcMidSource('BTC/USDT:not-a-number,ETH/USDT:0,SOL/USDT:-5,XRP/USDT:1e5');
    expect(src('BTC/USDT')).toBeNull();
    expect(src('ETH/USDT')).toBeNull();
    expect(src('SOL/USDT')).toBeNull();
    expect(src('XRP/USDT')).toBeNull();
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
