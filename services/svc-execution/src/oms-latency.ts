/**
 * OMS venue latency-grade observation door.
 *
 * A VenueLatencyGrade is a rumour with a timestamp — never a routing
 * decision and never a ledger input (Doctrine §0.6). Missing injection /
 * throw is observe_failed, not an invented F. `grade: null` stays null
 * (ungraded is not a bad grade). Internal venues refused.
 */
import type { VenueKind } from '@intafaced/venue-adapter';
import type { VenueLatencyGrade } from '@intafaced/venue-contracts';

export type OmsLatencyFn = (now?: Date) => VenueLatencyGrade | Promise<VenueLatencyGrade>;

export type OmsLatencyInput = {
  readonly venueId: string;
  readonly kind?: VenueKind;
  readonly latencyByVenue?: Readonly<Record<string, OmsLatencyFn>>;
};

export type OmsLatencyOk = { readonly ok: true; readonly latency: VenueLatencyGrade };
export type OmsLatencyRefuse =
  | { readonly ok: false; readonly reason: 'internal_venue'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'observe_failed'; readonly detail: string };

export type OmsLatencyResult = OmsLatencyOk | OmsLatencyRefuse;

function observeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function observeOmsLatency(input: OmsLatencyInput): Promise<OmsLatencyResult> {
  if (input.kind === 'internal') {
    return {
      ok: false,
      reason: 'internal_venue',
      detail: `refusing latency-grade observation on internal venue ${input.venueId}`,
    };
  }

  const venueId = input.venueId.trim();
  if (!venueId) {
    return { ok: false, reason: 'observe_failed', detail: 'venueId is required' };
  }

  const latency = input.latencyByVenue?.[venueId];
  if (!latency) {
    return { ok: false, reason: 'observe_failed', detail: `no latency-grade observation injected for venue ${venueId}` };
  }

  try {
    return { ok: true, latency: await latency() };
  } catch (err) {
    return { ok: false, reason: 'observe_failed', detail: observeErrorMessage(err) };
  }
}
