/**
 * Bridge AccountAdapter.positions → OMS observation.
 *
 * Does not swallow VenueCredentialsMissingError into []. A missing key is a
 * deployment that is not ready, not an empty book. Optional symbol filters the
 * observation; amounts and null marks are not rewritten.
 */
import type { AccountAdapter, VenuePosition } from '@intafaced/venue-contracts';

export type OmsPositionsFn = (symbol?: string) => Promise<VenuePosition[]>;

export function accountAdapterPositions(adapter: AccountAdapter): OmsPositionsFn {
  return async (symbol) => {
    const rows = await adapter.positions();
    if (!symbol) return rows;
    return rows.filter((row) => row.symbol === symbol);
  };
}
