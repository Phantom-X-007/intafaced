/**
 * OMS venue borrow-rate observation door.
 *
 * A BorrowRate is a rumour with a timestamp — never a ledger input
 * (Doctrine §0.6). Missing injection / throw is observe_failed, not an
 * invented 0 rate. Null available stays null. Internal venues refused.
 * Asset is required — MarketDataAdapter.borrowRate is per-asset.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { BorrowRate } from '@intafaced/venue-contracts';

export type OmsBorrowFn = (asset: string) => Promise<BorrowRate>;

export type OmsBorrowInput = {
  readonly venueId: string;
  readonly asset: string;
  readonly kind?: VenueKind;
  readonly borrowByVenue?: Readonly<Record<string, OmsBorrowFn>>;
};

export type OmsBorrowOk = { readonly ok: true; readonly borrow: BorrowRate };
export type OmsBorrowRefuse =
  | { readonly ok: false; readonly reason: 'internal_venue'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'observe_failed'; readonly detail: string };

export type OmsBorrowResult = OmsBorrowOk | OmsBorrowRefuse;

function observeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function observeOmsBorrow(input: OmsBorrowInput): Promise<OmsBorrowResult> {
  if (input.kind === 'internal') {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: `refusing borrow-rate observation on internal venue ${input.venueId}`,
    };
  }

  const venueId = input.venueId.trim();
  const asset = input.asset.trim();
  if (!venueId) {
    return { ok: false, reason: 'observe_failed', detail: 'venueId is required' };
  }
  if (!asset) {
    return { ok: false, reason: 'observe_failed', detail: 'asset is required' };
  }

  const borrow = input.borrowByVenue?.[venueId];
  if (!borrow) {
    return { ok: false, reason: 'observe_failed', detail: `no borrow-rate observation injected for venue ${venueId}` };
  }

  try {
    return { ok: true, borrow: await borrow(asset) };
  } catch (err) {
    return { ok: false, reason: 'observe_failed', detail: observeErrorMessage(err) };
  }
}
