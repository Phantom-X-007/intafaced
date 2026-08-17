/**
 * Bridge AccountAdapter.positions → OMS observation.
 *
 * Does not swallow VenueCredentialsMissingError into []. A missing key is a
 * deployment that is not ready, not an empty book. Optional symbol filters the
 * observation; optional side narrows long/short without inventing the other.
 * Amounts and null marks are not rewritten.
 */
import type { AccountAdapter, VenuePosition } from '@intafaced/venue-contracts';

export type OmsPositionsFn = (symbol?: string, side?: 'long' | 'short') => Promise<VenuePosition[]>;

export function accountAdapterPositions(adapter: AccountAdapter): OmsPositionsFn {
  return async (symbol, side) => {
    const rows = await adapter.positions();
    return rows.filter((row) => (!symbol || row.symbol === symbol) && (!side || row.side === side));
  };
}
