/**
 * OMS open-orders door — list acknowledged opens on an injected venue fn.
 *
 * Pending rows are dropped, not rewritten to open. Missing injection or throw
 * is list_failed. Internal venues refused. Optional side forwards buy/sell;
 * omitted still lists both (after dropping pending). Optional type forwards
 * limit/market; omitted still lists both.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { VenueOrder, VenueOrderType } from '@intafaced/venue-contracts';

export type OmsOpenOrdersFn = (symbol?: string, side?: 'buy' | 'sell', type?: VenueOrderType) => Promise<VenueOrder[]>;

export type OmsOpenOrdersInput = {
  readonly venueId: string;
  readonly symbol?: string;
  readonly side?: 'buy' | 'sell';
  readonly type?: VenueOrderType;
  readonly kind?: VenueKind;
  readonly openOrdersByVenue?: Readonly<Record<string, OmsOpenOrdersFn>>;
};

export type OmsOpenOrdersOk = { readonly ok: true; readonly orders: VenueOrder[] };
export type OmsOpenOrdersRefuse =
  | { readonly ok: false; readonly reason: 'internal_venue'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'list_failed'; readonly detail: string };

export type OmsOpenOrdersResult = OmsOpenOrdersOk | OmsOpenOrdersRefuse;

function listErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function listOmsOpenOrders(input: OmsOpenOrdersInput): Promise<OmsOpenOrdersResult> {
  if (input.kind === 'internal') {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: `refusing open-orders list on internal venue ${input.venueId}`,
    };
  }

  const venueId = input.venueId.trim();
  const symbol = input.symbol?.trim() || undefined;
  if (!venueId) {
    return { ok: false, reason: 'list_failed', detail: 'venueId is required' };
  }

  const list = input.openOrdersByVenue?.[venueId];
  if (!list) {
    return { ok: false, reason: 'list_failed', detail: `no open-orders list injected for venue ${venueId}` };
  }

  let orders: VenueOrder[];
  try {
    orders = await list(symbol, input.side, input.type);
  } catch (err) {
    return { ok: false, reason: 'list_failed', detail: listErrorMessage(err) };
  }

  return { ok: true, orders: orders.filter((order) => order.status !== 'pending') };
}
