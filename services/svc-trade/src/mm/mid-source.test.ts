import { describe, expect, it, vi } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { chainMmMidSources, createConfigMmMidSource, createMmMidSourceFromConfig, createVenueMmMidSource } from './mid-source.js';

describe('createConfigMmMidSource', () => {
  it('returns mapped mid; never invents missing', () => {
    const src = createConfigMmMidSource(new Map([['m1', '100.5']]));
    expect(src('m1')).toBe('100.5');
    expect(src('missing')).toBeNull();
  });

  it('treats blank mid as null', () => {
    const src = createConfigMmMidSource(new Map([['m1', '  ']]));
    expect(src('m1')).toBeNull();
  });
});

describe('createVenueMmMidSource', () => {
  it('mids two-sided book; null when unmapped or empty', async () => {
    const bid = parseAmount('100');
    const ask = parseAmount('102');
    const adapter = {
      snapshotBook: vi.fn(async () => ({
        bids: [[bid, parseAmount('1')]] as [bigint, bigint][],
        asks: [[ask, parseAmount('1')]] as [bigint, bigint][],
      })),
    };

    const src = createVenueMmMidSource({
      adapter,
      resolveSymbol: (id) => (id === 'm1' ? 'BTC/USDT' : null),
    });
    const mid = await src('m1');
    expect(mid).not.toBeNull();
    expect(Number(mid)).toBeCloseTo(101, 5);

    expect(await src('no-map')).toBeNull();

    adapter.snapshotBook.mockResolvedValueOnce({ bids: [], asks: [] });
    expect(await src('m1')).toBeNull();
  });

  it('null on venue error — never invent', async () => {
    const src = createVenueMmMidSource({
      adapter: {
        snapshotBook: vi.fn(async () => {
          throw new Error('down');
        }),
      },
      resolveSymbol: () => 'BTC/USDT',
    });
    expect(await src('m1')).toBeNull();
  });
});

describe('chainMmMidSources', () => {
  it('prefers first non-null', async () => {
    const chain = chainMmMidSources(
      () => null,
      () => '50',
      () => '99',
    );
    expect(await chain('x')).toBe('50');
  });

  it('all null → null', async () => {
    const chain = chainMmMidSources(
      () => null,
      async () => null,
    );
    expect(await chain('x')).toBeNull();
  });
});

describe('createMmMidSourceFromConfig', () => {
  it('config only when midFromVenue off', async () => {
    const src = createMmMidSourceFromConfig({
      midsEnv: 'm1:42',
      midFromVenue: false,
      venueAdapter: {
        snapshotBook: vi.fn(async () => {
          throw new Error('should not call');
        }),
      },
      resolveVenueSymbol: () => 'BTC/USDT',
    });
    expect(await src('m1')).toBe('42');
    expect(await src('m2')).toBeNull();
  });

  it('falls through to venue when config missing and midFromVenue on', async () => {
    const bid = parseAmount('200');
    const ask = parseAmount('200');
    const src = createMmMidSourceFromConfig({
      midsEnv: '',
      midFromVenue: true,
      venueAdapter: {
        snapshotBook: vi.fn(async () => ({
          bids: [[bid, parseAmount('1')]] as [bigint, bigint][],
          asks: [[ask, parseAmount('1')]] as [bigint, bigint][],
        })),
      },
      resolveVenueSymbol: (id) => (id === 'm1' ? 'BTC/USDT' : null),
    });
    expect(await src('m1')).not.toBeNull();
    expect(await src('m2')).toBeNull();
  });

  it('config beats venue', async () => {
    const src = createMmMidSourceFromConfig({
      midsEnv: 'm1:10',
      midFromVenue: true,
      venueAdapter: {
        snapshotBook: vi.fn(async () => ({
          bids: [[parseAmount('999'), parseAmount('1')]] as [bigint, bigint][],
          asks: [[parseAmount('999'), parseAmount('1')]] as [bigint, bigint][],
        })),
      },
      resolveVenueSymbol: () => 'BTC/USDT',
    });
    expect(await src('m1')).toBe('10');
  });

  it('null venue adapter with midFromVenue → config only', async () => {
    const src = createMmMidSourceFromConfig({
      midsEnv: '',
      midFromVenue: true,
      venueAdapter: null,
      resolveVenueSymbol: () => 'BTC/USDT',
    });
    expect(await src('m1')).toBeNull();
  });
});
