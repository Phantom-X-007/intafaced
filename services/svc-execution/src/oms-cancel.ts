/**
 * OMS cancel door — cancel by client order id on an injected venue fn.
 *
 * TradeAdapter.cancelOrder is client-id first (a pending order has no venue id).
 * Does not invent a canceled status: if the venue still says open/filled, that
 * result is returned. Missing injection or throw is `cancel_failed`.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { VenueOrder } from '@intafaced/venue-contracts';

export type OmsCancelFn = (symbol: string, clientOrderId: string) => Promise<VenueOrder>;

export type OmsCancelInput = {
  readonly venueId: string;
  readonly symbol: string;
  readonly clientOrderId: string;
  readonly kind?: VenueKind;
  readonly cancelByVenue?: Readonly<Record<string, OmsCancelFn>>;
};

export type OmsCancelOk = { readonly ok: true; readonly order: VenueOrder };
export type OmsCancelRefuse =
  | { readonly ok: false; readonly reason: 'internal_venue'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'cancel_failed'; readonly detail: string };

export type OmsCancelResult = OmsCancelOk | OmsCancelRefuse;

function cancelErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function cancelOmsOrder(input: OmsCancelInput): Promise<OmsCancelResult> {
  if (input.kind === 'internal') {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: `refusing cancel on internal venue ${input.venueId}`,
    };
  }

  const clientOrderId = input.clientOrderId.trim();
  const symbol = input.symbol.trim();
  const venueId = input.venueId.trim();
  if (!venueId || !symbol || !clientOrderId) {
    return { ok: false, reason: 'cancel_failed', detail: 'venueId, symbol, and clientOrderId are required' };
  }

  const cancel = input.cancelByVenue?.[venueId];
  if (!cancel) {
    return { ok: false, reason: 'cancel_failed', detail: `no cancel injected for venue ${venueId}` };
  }

  let order: VenueOrder;
  try {
    order = await cancel(symbol, clientOrderId);
  } catch (err) {
    return { ok: false, reason: 'cancel_failed', detail: cancelErrorMessage(err) };
  }

  if (order.status === 'pending') {
    return {
      ok: false,
      reason: 'cancel_failed',
      detail: 'venue cancel is still pending — refusing to invent canceled',
    };
  }

  return { ok: true, order };
}
