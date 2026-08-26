import { describe, expect, it } from 'vitest';
import { cancelQuoteGroupExternalMm, type MmLiveQuote } from './mm-cancel-quote-group.js';

function live(over: Partial<MmLiveQuote> = {}): MmLiveQuote {
  return {
    makerId: 'maker-a',
    quoteSetId: 'spot',
    quoteId: 'q-1',
    symbol: 'BTC/USDT',
    ...over,
  };
}

describe('cancelQuoteGroupExternalMm', () => {
  it('refuses a missing group name rather than cancel-all', () => {
    const result = cancelQuoteGroupExternalMm({
      makerId: 'maker-a',
      quoteSetId: '',
      liveQuotes: [live({ quoteSetId: 'spot' }), live({ quoteSetId: 'perps', quoteId: 'q-2', symbol: 'ETH/USDT' })],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('quote_set_id_missing');
    expect(result.detail).toMatch(/cancel-all is not the default/);
  });

  it('refuses whitespace group name rather than cancel-all', () => {
    const result = cancelQuoteGroupExternalMm({
      makerId: 'maker-a',
      quoteSetId: '  ',
      liveQuotes: [live()],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('quote_set_id_missing');
  });

  it('refuses a missing maker rather than inventing an owner', () => {
    const result = cancelQuoteGroupExternalMm({
      makerId: '',
      quoteSetId: 'spot',
      liveQuotes: [live()],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('maker_id_missing');
  });

  it('cancels one named group and leaves other groups standing', () => {
    const spot = live({ quoteSetId: 'spot', quoteId: 'q-spot' });
    const perps = live({ quoteSetId: 'perps', quoteId: 'q-perps', symbol: 'ETH/USDT' });
    const result = cancelQuoteGroupExternalMm({
      makerId: 'maker-a',
      quoteSetId: 'spot',
      liveQuotes: [spot, perps],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected admit');
    expect(result.quoteSetId).toBe('spot');
    expect(result.cancelled).toEqual([spot]);
    expect(result.leftStanding).toEqual([perps]);
  });

  it('does not cancel another maker’s quotes in the same group name', () => {
    const ours = live({ makerId: 'maker-a', quoteSetId: 'spot' });
    const theirs = live({ makerId: 'maker-b', quoteSetId: 'spot', quoteId: 'q-other' });
    const result = cancelQuoteGroupExternalMm({
      makerId: 'maker-a',
      quoteSetId: 'spot',
      liveQuotes: [ours, theirs],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected admit');
    expect(result.cancelled).toEqual([ours]);
    expect(result.leftStanding).toEqual([theirs]);
  });

  it('empty live set with a named group is an empty cancel, not a book wipe', () => {
    const result = cancelQuoteGroupExternalMm({
      makerId: 'maker-a',
      quoteSetId: 'spot',
      liveQuotes: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected admit');
    expect(result.cancelled).toEqual([]);
    expect(result.leftStanding).toEqual([]);
  });

  it('does not flatten positions — only named quotes leave the standing set', () => {
    const quotes = [
      live({ quoteSetId: 'spot', quoteId: 'q-1' }),
      live({ quoteSetId: 'spot', quoteId: 'q-2', symbol: 'ETH/USDT' }),
      live({ quoteSetId: 'options', quoteId: 'q-3', symbol: 'BTC-31DEC' }),
    ];
    const result = cancelQuoteGroupExternalMm({
      makerId: 'maker-a',
      quoteSetId: 'spot',
      liveQuotes: quotes,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected admit');
    expect(result.cancelled.map((q) => q.quoteId)).toEqual(['q-1', 'q-2']);
    expect(result.leftStanding.map((q) => q.quoteId)).toEqual(['q-3']);
    expect(result).not.toHaveProperty('positions');
    expect(result).not.toHaveProperty('flatten');
  });
});
