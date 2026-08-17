import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { AccountAdapter, TransferRail } from '@intafaced/venue-contracts';
import { VenueCredentialsMissingError } from '@intafaced/venue-contracts';
import { accountAdapterRails } from './oms-account-rails.js';

const now = new Date('2026-08-17T12:00:00.000Z');

function usdtRail(over: Partial<TransferRail> = {}): TransferRail {
  return {
    fromVenueId: 'street',
    toVenueId: 'harbour',
    asset: 'USDT',
    network: 'trc20',
    minAmount: parseAmount('10'),
    fee: parseAmount('1'),
    estimatedSeconds: 600,
    enabled: false,
    observedAt: now,
    ...over,
  };
}

function adapter(rails: TransferRail[] | ((asset: string) => Promise<TransferRail[]>)): AccountAdapter {
  return {
    venue: { id: 'street', displayName: 'Street', kind: 'external-cex', sequencedDepth: true },
    balances: async () => [],
    positions: async () => [],
    transferRails: async (asset) => (typeof rails === 'function' ? rails(asset) : rails),
  };
}

describe('accountAdapterRails', () => {
  it('forwards AccountAdapter.transferRails without rewriting enabled or fee', async () => {
    const observe = accountAdapterRails(adapter([usdtRail()]));
    const result = await observe('USDT');
    expect(result).toHaveLength(1);
    expect(result[0]!.enabled).toBe(false);
    expect(result[0]!.fee).toBe(parseAmount('1'));
    expect(result[0]!.minAmount).toBe(parseAmount('10'));
  });

  it('passes the asset through', async () => {
    const seen: string[] = [];
    const observe = accountAdapterRails(
      adapter(async (asset) => {
        seen.push(asset);
        return [usdtRail({ asset })];
      }),
    );
    await observe('USDC');
    expect(seen).toEqual(['USDC']);
  });

  it('propagates a missing key — does not invent an empty rail list', async () => {
    const observe = accountAdapterRails(
      adapter(async () => {
        throw new VenueCredentialsMissingError('street', 'transferRails', 'venue credentials missing for street');
      }),
    );
    await expect(observe('USDT')).rejects.toBeInstanceOf(VenueCredentialsMissingError);
  });

  it('empty [] from the venue is honest', async () => {
    const observe = accountAdapterRails(adapter([]));
    await expect(observe('USDT')).resolves.toEqual([]);
  });

  it('filters by enabled without hiding a suspended rail when omitted', async () => {
    const observe = accountAdapterRails(adapter([usdtRail({ enabled: false }), usdtRail({ enabled: true, network: 'erc20' })]));
    expect((await observe('USDT', true)).map((row) => row.network)).toEqual(['erc20']);
    expect((await observe('USDT', false)).map((row) => row.enabled)).toEqual([false]);
    expect(await observe('USDT')).toHaveLength(2);
  });

  it('filters by network without hiding other rails when omitted', async () => {
    const observe = accountAdapterRails(adapter([usdtRail({ network: 'trc20' }), usdtRail({ network: 'erc20', enabled: true })]));
    expect((await observe('USDT', undefined, 'erc20')).map((row) => row.network)).toEqual(['erc20']);
    expect(await observe('USDT', undefined, 'bep20')).toEqual([]);
    expect(await observe('USDT')).toHaveLength(2);
  });

  it('filters by toVenueId without hiding other destinations when omitted', async () => {
    const observe = accountAdapterRails(
      adapter([usdtRail({ toVenueId: 'harbour' }), usdtRail({ toVenueId: 'dock', network: 'erc20', enabled: true })]),
    );
    expect((await observe('USDT', undefined, undefined, 'dock')).map((row) => row.toVenueId)).toEqual(['dock']);
    expect(await observe('USDT', undefined, undefined, 'vault')).toEqual([]);
    expect(await observe('USDT')).toHaveLength(2);
  });
});
