/**
 * Bridge AccountAdapter.balances → OMS observation.
 *
 * Does not swallow VenueCredentialsMissingError into []. A missing key is a
 * deployment that is not ready, not an empty wallet.
 */
import type { AccountAdapter, VenueBalance } from '@intafaced/venue-contracts';

export type OmsBalancesFn = () => Promise<VenueBalance[]>;

export function accountAdapterBalances(adapter: AccountAdapter): OmsBalancesFn {
  return async () => adapter.balances();
}
