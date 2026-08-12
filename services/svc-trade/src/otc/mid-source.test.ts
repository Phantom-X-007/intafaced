import { describe, expect, it } from 'vitest';
import {
  createConfigOtcMidSource,
  createObservedOtcMidSource,
  NO_OTC_MIDS,
  otcPairKey,
} from './mid-source.js';

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

  it('drops an ops entry whose price is not a positive decimal', async () => {
    // An ops typo must cost a refusal at boot, not surface to a customer.
    const src = createConfigOtcMidSource('BTC/USDT:not-a-number,ETH/USDT:0,SOL/USDT:-5,XRP/USDT:1e5');
    expect(await src('BTC/USDT')).toBeNull();
    expect(await src('ETH/USDT')).toBeNull();
    expect(await src('SOL/USDT')).toBeNull();
    expect(await src('XRP/USDT')).toBeNull();
  });

  it('the production default sources nothing', async () => {
    expect(await NO_OTC_MIDS('BTC/USDT')).toBeNull();
  });

  it('blank env sources nothing — no zero, no invent', async () => {
    const src = createConfigOtcMidSource('');
    expect(await src('BTC/USDT')).toBeNull();
    expect(await createConfigOtcMidSource(undefined)('BTC/USDT')).toBeNull();
  });

  it('reads an ops-published mid stamped at boot asOf', async () => {
    const boot = new Date('2026-08-07T12:00:00.000Z');
    const src = createConfigOtcMidSource('BTC/USDT:65000,ETH/USDT:3200', boot);
    expect(await src('BTC/USDT')).toEqual({ mid: '65000', asOf: boot });
    expect(await src('ETH/USDT')).toEqual({ mid: '3200', asOf: boot });
    expect(await src('SOL/USDT')).toBeNull();
  });

  it('observed source refreshes asOf from the feed clock', async () => {
    let t = new Date('2026-08-07T12:00:00.000Z');
    const src = createObservedOtcMidSource('BTC/USDT:200', () => t);
    expect(await src('BTC/USDT')).toEqual({ mid: '200', asOf: t });
    t = new Date('2026-08-07T12:01:00.000Z');
    expect(await src('BTC/USDT')).toEqual({ mid: '200', asOf: t });
  });
});
