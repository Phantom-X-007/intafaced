/**
 * Bridge AccountAdapter.balances → OMS observation.
 *
 * Does not swallow VenueCredentialsMissingError into []. A missing key is a
 * deployment that is not ready, not an empty wallet. Optional asset filters
 * the observation; omitted still returns every asset. Never invents a 0 row.
 */
import type { AccountAdapter, VenueBalance } from '@intafaced/venue-contracts';

export type OmsBalancesFn = (asset?: string) => Promise<VenueBalance[]>;

export function accountAdapterBalances(adapter: AccountAdapter): OmsBalancesFn {
  return async (asset) => {
    const rows = await adapter.balances();
    if (!asset) return rows;
    return rows.filter((row) => row.asset === asset);
  };
}
