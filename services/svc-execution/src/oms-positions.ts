/**
 * OMS venue-position observation door.
 *
 * A VenuePosition is a rumour with a timestamp — never a ledger input
 * (Doctrine §0.6). Missing credentials / throw is observe_failed, not [].
 * Empty [] is honest: the venue reported no positions. Internal venues refused.
 * Null mark / PnL / liq stay null — never rewritten to 0.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { VenuePosition } from '@intafaced/venue-contracts';

export type OmsPositionsFn = (symbol?: string) => Promise<VenuePosition[]>;

export type OmsPositionsInput = {
  readonly venueId: string;
  readonly symbol?: string;
  readonly kind?: VenueKind;
  readonly positionsByVenue?: Readonly<Record<string, OmsPositionsFn>>;
};

export type OmsPositionsOk = { readonly ok: true; readonly positions: VenuePosition[] };
export type OmsPositionsRefuse =
  | { readonly ok: false; readonly reason: 'internal_venue'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'observe_failed'; readonly detail: string };

export type OmsPositionsResult = OmsPositionsOk | OmsPositionsRefuse;

function observeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function observeOmsPositions(input: OmsPositionsInput): Promise<OmsPositionsResult> {
  if (input.kind === 'internal') {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: `refusing venue-position observation on internal venue ${input.venueId}`,
    };
  }

  const venueId = input.venueId.trim();
  const symbol = input.symbol?.trim() || undefined;
  if (!venueId) {
    return { ok: false, reason: 'observe_failed', detail: 'venueId is required' };
  }

  const positions = input.positionsByVenue?.[venueId];
  if (!positions) {
    return { ok: false, reason: 'observe_failed', detail: `no position observation injected for venue ${venueId}` };
  }

  try {
    return { ok: true, positions: await positions(symbol) };
  } catch (err) {
    return { ok: false, reason: 'observe_failed', detail: observeErrorMessage(err) };
  }
}
