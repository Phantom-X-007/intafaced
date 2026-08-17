/**
 * OMS fetch door — read an order by client order id on an injected venue fn.
 *
 * TradeAdapter.fetchOrder is client-id first. Does not invent a status: the
 * venue row is returned as-is except pending, which is fetch_failed (no
 * acknowledgement yet). Missing injection or throw is fetch_failed.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { VenueOrder } from '@intafaced/venue-contracts';

export type OmsFetchFn = (symbol: string, clientOrderId: string) => Promise<VenueOrder>;

export type OmsFetchInput = {
  readonly venueId: string;
  readonly symbol: string;
  readonly clientOrderId: string;
  readonly kind?: VenueKind;
  readonly fetchByVenue?: Readonly<Record<string, OmsFetchFn>>;
};

export type OmsFetchOk = { readonly ok: true; readonly order: VenueOrder };
export type OmsFetchRefuse =
  | { readonly ok: false; readonly reason: 'internal_venue'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'fetch_failed'; readonly detail: string };

export type OmsFetchResult = OmsFetchOk | OmsFetchRefuse;

function fetchErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function fetchOmsOrder(input: OmsFetchInput): Promise<OmsFetchResult> {
  if (input.kind === 'internal') {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: `refusing fetch on internal venue ${input.venueId}`,
    };
  }

  const clientOrderId = input.clientOrderId.trim();
  const symbol = input.symbol.trim();
  const venueId = input.venueId.trim();
  if (!venueId || !symbol || !clientOrderId) {
    return { ok: false, reason: 'fetch_failed', detail: 'venueId, symbol, and clientOrderId are required' };
  }

  const fetchOrder = input.fetchByVenue?.[venueId];
  if (!fetchOrder) {
    return { ok: false, reason: 'fetch_failed', detail: `no fetch injected for venue ${venueId}` };
  }

  let order: VenueOrder;
  try {
    order = await fetchOrder(symbol, clientOrderId);
  } catch (err) {
    return { ok: false, reason: 'fetch_failed', detail: fetchErrorMessage(err) };
  }

  if (order.status === 'pending') {
    return {
      ok: false,
      reason: 'fetch_failed',
      detail: 'venue order is still pending — refusing to invent an acknowledgement',
    };
  }

  return { ok: true, order };
}
