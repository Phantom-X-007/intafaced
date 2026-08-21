/**
 * OMS venue book-snapshot observation door.
 *
 * A VenueBookSnapshot is a rumour with a timestamp — never a mid, never a
 * mark, never a ledger input (Doctrine §0.6). Missing injection / throw is
 * observe_failed, not an invented book. Empty bids/asks stay empty.
 * `sequenced: false` / `sequence: -1` stay as the street sent them (not 0).
 * Internal venues refused. Symbol is required — snapshotBook is per-instrument.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { VenueBookSnapshot } from '@intafaced/venue-contracts';

export type OmsSnapshotFn = (symbol: string, limit?: number) => Promise<VenueBookSnapshot>;

export type OmsSnapshotInput = {
  readonly venueId: string;
  readonly symbol: string;
  readonly limit?: number;
  readonly kind?: VenueKind;
  readonly snapshotByVenue?: Readonly<Record<string, OmsSnapshotFn>>;
};

export type OmsSnapshotOk = { readonly ok: true; readonly snapshot: VenueBookSnapshot };
export type OmsSnapshotRefuse =
  | { readonly ok: false; readonly reason: 'internal_venue'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'observe_failed'; readonly detail: string };

export type OmsSnapshotResult = OmsSnapshotOk | OmsSnapshotRefuse;

function observeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function observeOmsSnapshot(input: OmsSnapshotInput): Promise<OmsSnapshotResult> {
  if (input.kind === 'internal') {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: `refusing book-snapshot observation on internal venue ${input.venueId}`,
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

  const snapshot = input.snapshotByVenue?.[venueId];
  if (!snapshot) {
    return { ok: false, reason: 'observe_failed', detail: `no book-snapshot observation injected for venue ${venueId}` };
  }

  try {
    return { ok: true, snapshot: await snapshot(symbol, input.limit) };
  } catch (err) {
    return { ok: false, reason: 'observe_failed', detail: observeErrorMessage(err) };
  }
}
