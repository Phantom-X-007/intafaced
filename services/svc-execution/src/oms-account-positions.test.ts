import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { AccountAdapter, VenuePosition } from '@intafaced/venue-contracts';
import { VenueCredentialsMissingError } from '@intafaced/venue-contracts';
import { accountAdapterPositions } from './oms-account-positions.js';

const now = new Date('2026-08-17T12:00:00.000Z');

function perp(over: Partial<VenuePosition> = {}): VenuePosition {
  return {
    venueId: 'street',
    symbol: 'BTC/USDT',
    side: 'long',
    size: parseAmount('1'),
    entryPrice: parseAmount('50000'),
    markPrice: null,
    unrealisedPnl: null,
    leverageBps: 100_000,
    liquidationPrice: null,
    observedAt: now,
    ...over,
  };
}

function adapter(positions: VenuePosition[] | (() => Promise<VenuePosition[]>)): AccountAdapter {
  return {
    venue: { id: 'street', displayName: 'Street', kind: 'external-cex', sequencedDepth: true },
    balances: async () => [],
    positions: async () => (typeof positions === 'function' ? positions() : positions),
    transferRails: async () => [],
  };
}

describe('accountAdapterPositions', () => {
  it('forwards AccountAdapter.positions without inventing a mark', async () => {
    const observe = accountAdapterPositions(adapter([perp()]));
    const result = await observe();
    expect(result).toHaveLength(1);
    expect(result[0]!.size).toBe(parseAmount('1'));
    expect(result[0]!.markPrice).toBeNull();
    expect(result[0]!.unrealisedPnl).toBeNull();
  });

  it('filters by symbol without rewriting other rows', async () => {
    const observe = accountAdapterPositions(adapter([perp(), perp({ symbol: 'ETH/USDT', size: parseAmount('2') })]));
    const result = await observe('ETH/USDT');
    expect(result).toHaveLength(1);
    expect(result[0]!.symbol).toBe('ETH/USDT');
    expect(result[0]!.size).toBe(parseAmount('2'));
  });

  it('propagates a missing key — does not invent an empty book', async () => {
    const observe = accountAdapterPositions(
      adapter(async () => {
        throw new VenueCredentialsMissingError('street', 'positions', 'venue credentials missing for street');
      }),
    );
    await expect(observe()).rejects.toBeInstanceOf(VenueCredentialsMissingError);
  });

  it('empty [] from the venue is honest', async () => {
    const observe = accountAdapterPositions(adapter([]));
    await expect(observe()).resolves.toEqual([]);
  });
});
