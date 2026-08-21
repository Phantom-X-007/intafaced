/**
 * OMS venue-balance observation door.
 *
 * A VenueBalance is a rumour with a timestamp — never a ledger input
 * (Doctrine §0.6). Missing credentials / throw is observe_failed, not [].
 * Empty [] is honest: the venue reported no assets. Internal venues refused.
 * Optional asset forwards a single-currency observation; omitted still
 * observes every asset the street returned. Never invents a 0 row.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { VenueBalance } from '@intafaced/venue-contracts';

export type OmsBalancesFn = (asset?: string) => Promise<VenueBalance[]>;

export type OmsBalancesInput = {
  readonly venueId: string;
  readonly asset?: string;
  readonly kind?: VenueKind;
  readonly balancesByVenue?: Readonly<Record<string, OmsBalancesFn>>;
};

export type OmsBalancesOk = { readonly ok: true; readonly balances: VenueBalance[] };
export type OmsBalancesRefuse =
  | { readonly ok: false; readonly reason: 'internal_venue'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'observe_failed'; readonly detail: string };

export type OmsBalancesResult = OmsBalancesOk | OmsBalancesRefuse;

function observeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function observeOmsBalances(input: OmsBalancesInput): Promise<OmsBalancesResult> {
  if (input.kind === 'internal') {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: `refusing venue-balance observation on internal venue ${input.venueId}`,
    };
  }

  const venueId = input.venueId.trim();
  const asset = input.asset?.trim() || undefined;
  if (!venueId) {
    return { ok: false, reason: 'observe_failed', detail: 'venueId is required' };
  }

  const balances = input.balancesByVenue?.[venueId];
  if (!balances) {
    return { ok: false, reason: 'observe_failed', detail: `no balance observation injected for venue ${venueId}` };
  }

  try {
    return { ok: true, balances: await balances(asset) };
  } catch (err) {
    return { ok: false, reason: 'observe_failed', detail: observeErrorMessage(err) };
  }
}
