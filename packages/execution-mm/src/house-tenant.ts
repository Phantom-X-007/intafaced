import { type VenueKind } from '@intafaced/venue-adapter';
import { isExternalVenueKind } from './market-making.js';

/**
 * §28 HOUSE TENANT — Q1 EXTERNAL-ONLY PIN (D26-P0-01).
 *
 * ADR `docs/adr/2026-08-08-house-desk-and-market-making-fairness.md`:
 *   House desk v1 trades external venues only. Pointing this tenant at our
 *   matching book (`kind: 'internal'`) stays BLOCKED until a later explicit
 *   owner ruling. Tenancy mechanism may exist; this door does not invent a
 *   ranking preference, queue privilege, or existence-disclosure answer.
 *
 * Leverage: existing Q1 refuse already used by `quoteExternalMm` /
 * `refuseInternalMm`. This module names the house-tenant target pin so the
 * matching-book refuse cannot be bypassed by a "tenant" wrapper.
 */

export type HouseTenantRefuseReason = 'internal_matching_book' | 'invalid_venue';

export interface HouseTenantTarget {
  readonly venueId: string;
  readonly kind: VenueKind;
}

export interface HouseTenantRefusal {
  readonly ok: false;
  readonly reason: HouseTenantRefuseReason;
  readonly venueId: string;
  readonly kind: VenueKind;
  readonly detail: string;
}

export interface HouseTenantExternalOk {
  readonly ok: true;
  readonly venueId: string;
  readonly kind: VenueKind;
}

export type HouseTenantPinResult = HouseTenantExternalOk | HouseTenantRefusal;

const INTERNAL_BOOK_DETAIL =
  'D26-P0-01 Q1 EXTERNAL-ONLY — house tenant may not point at our matching book; internal-venue half stays blocked until a later owner ruling';

const INVALID_VENUE_DETAIL = 'external venue id must be a non-empty opaque string — no venue list is invented';

/**
 * Pin a house-tenant venue target. Internal matching book always refuses.
 * Empty / whitespace venueId refuses `invalid_venue` (same door as
 * `@intafaced/execution-house-tenant` `trim().length===0`).
 * External kinds with a real id pass the door only — no extra preference.
 */
export function pinHouseTenantTarget(target: HouseTenantTarget): HouseTenantPinResult {
  if (!isExternalVenueKind(target.kind)) {
    return {
      ok: false,
      reason: 'internal_matching_book',
      venueId: target.venueId,
      kind: target.kind,
      detail: INTERNAL_BOOK_DETAIL,
    };
  }
  const venueId = target.venueId.trim();
  if (venueId.length === 0) {
    return {
      ok: false,
      reason: 'invalid_venue',
      venueId: target.venueId,
      kind: target.kind,
      detail: INVALID_VENUE_DETAIL,
    };
  }
  return { ok: true, venueId, kind: target.kind };
}

/** Explicit refuse for the internal-venue half. No success branch. */
export function refuseHouseTenantInternalBook(detail?: string): HouseTenantRefusal {
  return {
    ok: false,
    reason: 'internal_matching_book',
    venueId: 'matching',
    kind: 'internal',
    detail: detail ?? INTERNAL_BOOK_DETAIL,
  };
}
