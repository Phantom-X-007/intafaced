/**
 * OMS venue instrument-catalog observation door.
 *
 * A VenueMarket[] is a rumour with timestamps — never a routing
 * decision and never a ledger input (Doctrine §0.6). Missing injection /
 * throw is observe_failed, not an invented listing. Empty array stays
 * empty (no listings is not a fake BTC/USDT). Internal venues refused.
 * Optional type forwards spot/perpetual/…; omitted still observes every
 * type. Optional quote forwards USDT/…; omitted still observes every quote.
 * Inactive listings stay inactive.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { VenueInstrumentType, VenueMarket } from '@intafaced/venue-contracts';

export type OmsMarketsFn = (type?: VenueInstrumentType, quote?: string) => Promise<readonly VenueMarket[]>;

export type OmsMarketsInput = {
  readonly venueId: string;
  readonly type?: VenueInstrumentType;
  readonly quote?: string;
  readonly kind?: VenueKind;
  readonly marketsByVenue?: Readonly<Record<string, OmsMarketsFn>>;
};

export type OmsMarketsOk = { readonly ok: true; readonly markets: readonly VenueMarket[] };
export type OmsMarketsRefuse =
  | { readonly ok: false; readonly reason: 'internal_venue'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'observe_failed'; readonly detail: string };

export type OmsMarketsResult = OmsMarketsOk | OmsMarketsRefuse;

function observeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function observeOmsMarkets(input: OmsMarketsInput): Promise<OmsMarketsResult> {
  if (input.kind === 'internal') {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: `refusing markets observation on internal venue ${input.venueId}`,
    };
  }

  const venueId = input.venueId.trim();
  if (!venueId) {
    return { ok: false, reason: 'observe_failed', detail: 'venueId is required' };
  }

  const markets = input.marketsByVenue?.[venueId];
  if (!markets) {
    return { ok: false, reason: 'observe_failed', detail: `no markets observation injected for venue ${venueId}` };
  }

  try {
    return { ok: true, markets: await markets(input.type, input.quote?.trim() || undefined) };
  } catch (err) {
    return { ok: false, reason: 'observe_failed', detail: observeErrorMessage(err) };
  }
}
