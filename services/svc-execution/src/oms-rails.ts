/**
 * OMS venue transfer-rail observation door.
 *
 * A TransferRail is a rumour with a timestamp — never a transfer instruction
 * and never a ledger input (Doctrine §0.6). Missing credentials / throw is
 * observe_failed, not []. Empty [] is honest: the venue reported no rails for
 * that asset. Disabled rails stay disabled. Internal venues refused.
 * Asset is required — AccountAdapter.transferRails is per-asset.
 * Optional enabled forwards true/false; omitted still observes disabled rails.
 * Optional network forwards trc20/…; omitted still observes every network.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { TransferRail } from '@intafaced/venue-contracts';

export type OmsRailsFn = (asset: string, enabled?: boolean, network?: string) => Promise<TransferRail[]>;

export type OmsRailsInput = {
  readonly venueId: string;
  readonly asset: string;
  readonly enabled?: boolean;
  readonly network?: string;
  readonly kind?: VenueKind;
  readonly railsByVenue?: Readonly<Record<string, OmsRailsFn>>;
};

export type OmsRailsOk = { readonly ok: true; readonly rails: TransferRail[] };
export type OmsRailsRefuse =
  | { readonly ok: false; readonly reason: 'internal_venue'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'observe_failed'; readonly detail: string };

export type OmsRailsResult = OmsRailsOk | OmsRailsRefuse;

function observeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function observeOmsRails(input: OmsRailsInput): Promise<OmsRailsResult> {
  if (input.kind === 'internal') {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: `refusing transfer-rail observation on internal venue ${input.venueId}`,
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

  const rails = input.railsByVenue?.[venueId];
  if (!rails) {
    return { ok: false, reason: 'observe_failed', detail: `no transfer-rail observation injected for venue ${venueId}` };
  }

  try {
    return { ok: true, rails: await rails(asset, input.enabled, input.network?.trim() || undefined) };
  } catch (err) {
    return { ok: false, reason: 'observe_failed', detail: observeErrorMessage(err) };
  }
}
