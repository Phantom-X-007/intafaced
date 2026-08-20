/**
 * OMS venue instrument-catalog observation door.
 *
 * A VenueMarket[] is a rumour with timestamps — never a routing
 * decision and never a ledger input (Doctrine §0.6). Missing injection /
 * throw is observe_failed, not an invented listing. Empty array stays
 * empty (no listings is not a fake BTC/USDT). Internal venues refused.
 * Optional type forwards spot/perpetual/…; omitted still observes every
 * type. Optional quote forwards USDT/…; omitted still observes every quote.
 * Optional base forwards BTC/…; omitted still observes every base.
 * Optional active forwards true/false; omitted still observes inactive listings.
 * Optional settle forwards USDT/…; omitted still observes null settle (spot).
 * Optional symbol forwards the unified BASE/QUOTE; omitted still observes every listing.
 * Optional venueSymbol forwards the venue's own spelling; omitted still observes every listing.
 * Optional expiry forwards a Date; omitted still observes every listing including
 * null expiry (spot) and inactive listings. Provided expiry is an exact Date.getTime() match.
 * Inactive listings stay inactive. Null settle stays null. Do not filter contractSize.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { VenueInstrumentType, VenueMarket } from '@intafaced/venue-contracts';

export type OmsMarketsFn = (
  type?: VenueInstrumentType,
  quote?: string,
  base?: string,
  active?: boolean,
  settle?: string,
  symbol?: string,
  venueSymbol?: string,
  expiry?: Date,
) => Promise<readonly VenueMarket[]>;

export type OmsMarketsInput = {
  readonly venueId: string;
  readonly type?: VenueInstrumentType;
  readonly quote?: string;
  readonly base?: string;
  readonly active?: boolean;
  readonly settle?: string;
  readonly symbol?: string;
  readonly venueSymbol?: string;
  readonly expiry?: Date;
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
    return {
      ok: true,
      markets: await markets(
        input.type,
        input.quote?.trim() || undefined,
        input.base?.trim() || undefined,
        input.active,
        input.settle?.trim() || undefined,
        input.symbol?.trim() || undefined,
        input.venueSymbol?.trim() || undefined,
        input.expiry,
      ),
    };
  } catch (err) {
    return { ok: false, reason: 'observe_failed', detail: observeErrorMessage(err) };
  }
}
