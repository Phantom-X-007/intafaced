import { describe, expect, it } from 'vitest';
import { parseAmount, ZERO } from '@intafaced/ledger-client';
import type { AccountAdapter, VenueBalance } from '@intafaced/venue-contracts';
import { VenueCredentialsMissingError } from '@intafaced/venue-contracts';
import { accountAdapterBalances } from './oms-account-balances.js';

const now = new Date('2026-08-17T12:00:00.000Z');

function usdt(over: Partial<VenueBalance> = {}): VenueBalance {
  return {
    venueId: 'street',
    asset: 'USDT',
    free: parseAmount('100'),
    used: ZERO,
    total: parseAmount('100'),
    observedAt: now,
    ...over,
  };
}

function adapter(balances: VenueBalance[] | (() => Promise<VenueBalance[]>)): AccountAdapter {
  return {
    venue: { id: 'street', displayName: 'Street', kind: 'external-cex', sequencedDepth: true },
    balances: async () => (typeof balances === 'function' ? balances() : balances),
    positions: async () => [],
    transferRails: async () => [],
  };
}

describe('accountAdapterBalances', () => {
  it('forwards AccountAdapter.balances without rewriting amounts', async () => {
    const observe = accountAdapterBalances(adapter([usdt()]));
    const result = await observe();
    expect(result).toHaveLength(1);
    expect(result[0]!.free).toBe(parseAmount('100'));
    expect(result[0]!.total).toBe(parseAmount('100'));
  });

  it('propagates a missing key — does not invent an empty wallet', async () => {
    const observe = accountAdapterBalances(
      adapter(async () => {
        throw new VenueCredentialsMissingError('street', 'balances', 'venue credentials missing for street');
      }),
    );
    await expect(observe()).rejects.toBeInstanceOf(VenueCredentialsMissingError);
  });

  it('empty [] from the venue is honest', async () => {
    const observe = accountAdapterBalances(adapter([]));
    await expect(observe()).resolves.toEqual([]);
  });
});
