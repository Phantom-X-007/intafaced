import { describe, expect, it, vi } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import type { MarketDataAdapter, VenueBookSnapshot } from '@intafaced/venue-contracts';
import {
  createConfiguredVenueMarkSource,
  createVenueMarketDataAdapter,
  markSourceFromVenuePublicBook,
  markSourcePrefer,
  midFromVenueBook,
  parseVenueMarkSymbols,
} from './mark-from-venue.js';
import type { MarkSource } from './liquidation-tick.js';

function snap(partial: { bids?: [string, string][]; asks?: [string, string][]; venueId?: string; symbol?: string }): VenueBookSnapshot {
  const level = ([p, q]: [string, string]) => [parseAmount(p), parseAmount(q)] as const;
  return {
    venueId: partial.venueId ?? 'binance-spot',
    symbol: partial.symbol ?? 'BTC/USDT',
    bids: (partial.bids ?? []).map(level),
    asks: (partial.asks ?? []).map(level),
    sequence: 1,
    sequenced: true,
    observedAt: new Date(1_700_000_000_000),
  };
}

function fakeAdapter(impl: MarketDataAdapter['snapshotBook']): Pick<MarketDataAdapter, 'snapshotBook'> {
  return { snapshotBook: impl };
}

describe('midFromVenueBook', () => {
  it('mids two-sided top of book', () => {
    expect(
      midFromVenueBook({
        bids: [[parseAmount('100'), parseAmount('1')]],
        asks: [[parseAmount('102'), parseAmount('1')]],
      }),
    ).toBe('101');
  });

  it('empty or one-sided → null (never invent)', () => {
    expect(midFromVenueBook({ bids: [], asks: [] })).toBeNull();
    expect(
      midFromVenueBook({
        bids: [[parseAmount('100'), parseAmount('1')]],
        asks: [],
      }),
    ).toBeNull();
  });
});

describe('parseVenueMarkSymbols', () => {
  it('empty → no invent map', () => {
    expect(parseVenueMarkSymbols(undefined).size).toBe(0);
    expect(parseVenueMarkSymbols('').size).toBe(0);
    expect(parseVenueMarkSymbols('  ').size).toBe(0);
  });

  it('parses marketId:symbol pairs', () => {
    const m = parseVenueMarkSymbols('m1:BTC/USDT, m2:ETH/USDT');
    expect(m.get('m1')).toBe('BTC/USDT');
    expect(m.get('m2')).toBe('ETH/USDT');
  });

  it('skips malformed pairs rather than inventing', () => {
    const m = parseVenueMarkSymbols('nocolon, :nosymbol, empty:, good:BTC/USDT');
    expect(m.size).toBe(1);
    expect(m.get('good')).toBe('BTC/USDT');
  });
});

describe('createVenueMarketDataAdapter', () => {
  it('empty / off → null (feature off)', () => {
    expect(createVenueMarketDataAdapter('')).toBeNull();
    expect(createVenueMarketDataAdapter('off')).toBeNull();
    expect(createVenueMarketDataAdapter('none')).toBeNull();
  });

  it('unknown venue → null (refuse invent adapter)', () => {
    expect(createVenueMarketDataAdapter('made-up-cex')).toBeNull();
  });

  it('binance-spot → real public MarketDataAdapter', () => {
    const a = createVenueMarketDataAdapter('binance-spot');
    expect(a).not.toBeNull();
    expect(a!.venue.id).toBe('binance-spot');
  });
});

describe('markSourceFromVenuePublicBook', () => {
  it('mids venue public snapshot when market is mapped', async () => {
    const adapter = fakeAdapter(async (symbol) => {
      expect(symbol).toBe('BTC/USDT');
      return snap({ bids: [['99000', '1']], asks: [['101000', '1']], symbol });
    });
    const src = markSourceFromVenuePublicBook({
      adapter,
      resolveSymbol: (id) => (id === 'm1' ? 'BTC/USDT' : null),
    });
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBe('100000');
  });

  it('unmapped market → null (never invent symbol)', async () => {
    const adapter = fakeAdapter(async () => {
      throw new Error('must not call venue for unmapped market');
    });
    const src = markSourceFromVenuePublicBook({
      adapter,
      resolveSymbol: () => null,
    });
    expect(await src.markPrice({ marketId: 'unknown', at: new Date() })).toBeNull();
  });

  it('empty venue book → null', async () => {
    const src = markSourceFromVenuePublicBook({
      adapter: fakeAdapter(async () => snap({ bids: [], asks: [] })),
      resolveSymbol: () => 'BTC/USDT',
    });
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBeNull();
  });

  it('venue error → null (never invent mid)', async () => {
    const src = markSourceFromVenuePublicBook({
      adapter: fakeAdapter(async () => {
        throw new Error('rate_limited');
      }),
      resolveSymbol: () => 'BTC/USDT',
    });
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBeNull();
  });
});

describe('markSourcePrefer', () => {
  it('uses primary when present', async () => {
    const primary: MarkSource = { markPrice: async () => '111' };
    const secondary: MarkSource = { markPrice: async () => '222' };
    const src = markSourcePrefer(primary, secondary);
    expect(await src.markPrice({ marketId: 'm', at: new Date() })).toBe('111');
  });

  it('falls back to secondary when primary null', async () => {
    const primary: MarkSource = { markPrice: async () => null };
    const secondary: MarkSource = { markPrice: async () => '222' };
    const src = markSourcePrefer(primary, secondary);
    expect(await src.markPrice({ marketId: 'm', at: new Date() })).toBe('222');
  });

  it('both null → null', async () => {
    const src = markSourcePrefer({ markPrice: async () => null }, { markPrice: async () => null });
    expect(await src.markPrice({ marketId: 'm', at: new Date() })).toBeNull();
  });
});

describe('createConfiguredVenueMarkSource', () => {
  it('unconfigured venue → null', () => {
    expect(
      createConfiguredVenueMarkSource({
        venueId: '',
        symbols: 'm1:BTC/USDT',
        adapter: fakeAdapter(async () => snap({ bids: [['1', '1']], asks: [['3', '1']] })),
      }),
    ).toBeNull();
  });

  it('configured + injected adapter → honest mid', async () => {
    const cfg = createConfiguredVenueMarkSource({
      venueId: 'binance-spot',
      symbols: 'm1:BTC/USDT',
      adapter: fakeAdapter(async () => snap({ bids: [['10', '1']], asks: [['12', '1']] })),
    });
    expect(cfg).not.toBeNull();
    expect(cfg!.symbolCount).toBe(1);
    expect(await cfg!.source.markPrice({ marketId: 'm1', at: new Date() })).toBe('11');
    expect(await cfg!.source.markPrice({ marketId: 'unmapped', at: new Date() })).toBeNull();
  });

  it('unknown venue without inject → null', () => {
    expect(
      createConfiguredVenueMarkSource({
        venueId: 'not-a-real-venue',
        symbols: 'm1:BTC/USDT',
      }),
    ).toBeNull();
  });
});

describe('honesty: fabric snapshot is the only data path', () => {
  it('calls snapshotBook once per mark read with mapped symbol', async () => {
    const snapshotBook = vi.fn(async () => snap({ bids: [['50', '1']], asks: [['50', '1']] }));
    const src = markSourceFromVenuePublicBook({
      adapter: { snapshotBook },
      resolveSymbol: () => 'ETH/USDT',
    });
    await src.markPrice({ marketId: 'm-eth', at: new Date() });
    expect(snapshotBook).toHaveBeenCalledTimes(1);
    expect(snapshotBook).toHaveBeenCalledWith('ETH/USDT', 5);
  });
});
