/**
 * Bridge AccountAdapter.transferRails → OMS observation.
 *
 * Does not swallow VenueCredentialsMissingError into []. A missing key is a
 * deployment that is not ready, not "no rails". Disabled rails stay disabled.
 * Does not invent a transfer.
 */
import type { AccountAdapter, TransferRail } from '@intafaced/venue-contracts';

export type OmsRailsFn = (asset: string) => Promise<TransferRail[]>;

export function accountAdapterRails(adapter: AccountAdapter): OmsRailsFn {
  return async (asset) => adapter.transferRails(asset);
}
