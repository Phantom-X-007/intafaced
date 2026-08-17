/**
 * Bridge AccountAdapter.transferRails → OMS observation.
 *
 * Does not swallow VenueCredentialsMissingError into []. A missing key is a
 * deployment that is not ready, not "no rails". Disabled rails stay disabled.
 * Optional enabled narrows open/suspended without inventing the other.
 * Does not invent a transfer.
 */
import type { AccountAdapter, TransferRail } from '@intafaced/venue-contracts';

export type OmsRailsFn = (asset: string, enabled?: boolean) => Promise<TransferRail[]>;

export function accountAdapterRails(adapter: AccountAdapter): OmsRailsFn {
  return async (asset, enabled) => {
    const rows = await adapter.transferRails(asset);
    if (enabled === undefined) return rows;
    return rows.filter((row) => row.enabled === enabled);
  };
}
