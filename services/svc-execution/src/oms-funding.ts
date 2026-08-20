/**
 * OMS venue funding-rate observation door.
 *
 * A FundingRate is a rumour with a timestamp — never a ledger input
 * (Doctrine §0.6). Missing injection / throw is observe_failed, not a
 * invented 0 rate. Null mark / index stay null. Internal venues refused.
 * Symbol is required — MarketDataAdapter.fundingRate is per-instrument.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { FundingRate } from '@intafaced/venue-contracts';

export type OmsFundingFn = (symbol: string) => Promise<FundingRate>;

export type OmsFundingInput = {
  readonly venueId: string;
  readonly symbol: string;
  readonly kind?: VenueKind;
  readonly fundingByVenue?: Readonly<Record<string, OmsFundingFn>>;
};

export type OmsFundingOk = { readonly ok: true; readonly funding: FundingRate };
export type OmsFundingRefuse =
  | { readonly ok: false; readonly reason: 'internal_venue'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'observe_failed'; readonly detail: string };

export type OmsFundingResult = OmsFundingOk | OmsFundingRefuse;

function observeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function observeOmsFunding(input: OmsFundingInput): Promise<OmsFundingResult> {
  if (input.kind === 'internal') {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: `refusing funding-rate observation on internal venue ${input.venueId}`,
    };
  }

  const venueId = input.venueId.trim();
  const symbol = input.symbol.trim();
  if (!venueId) {
    return { ok: false, reason: 'observe_failed', detail: 'venueId is required' };
  }
  if (!symbol) {
    return { ok: false, reason: 'observe_failed', detail: 'symbol is required' };
  }

  const funding = input.fundingByVenue?.[venueId];
  if (!funding) {
    return { ok: false, reason: 'observe_failed', detail: `no funding-rate observation injected for venue ${venueId}` };
  }

  try {
    return { ok: true, funding: await funding(symbol) };
  } catch (err) {
    return { ok: false, reason: 'observe_failed', detail: observeErrorMessage(err) };
  }
}
