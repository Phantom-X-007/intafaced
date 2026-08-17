/**
 * Bridge AccountAdapter.transferRails → OMS observation.
 *
 * Does not swallow VenueCredentialsMissingError into []. A missing key is a
 * deployment that is not ready, not "no rails". Disabled rails stay disabled.
 * Optional enabled narrows open/suspended without inventing the other.
 * Optional network narrows trc20/… without inventing a rail.
 * Optional toVenueId narrows harbour/… without inventing a rail.
 * Does not invent a transfer.
 */
import type { AccountAdapter, TransferRail } from '@intafaced/venue-contracts';

export type OmsRailsFn = (
  asset: string,
  enabled?: boolean,
  network?: string,
  toVenueId?: string,
) => Promise<TransferRail[]>;

export function accountAdapterRails(adapter: AccountAdapter): OmsRailsFn {
  return async (asset, enabled, network, toVenueId) => {
    const rows = await adapter.transferRails(asset);
    return rows.filter(
      (row) =>
        (enabled === undefined || row.enabled === enabled) &&
        (!network || row.network === network) &&
        (!toVenueId || row.toVenueId === toVenueId),
    );
  };
}
