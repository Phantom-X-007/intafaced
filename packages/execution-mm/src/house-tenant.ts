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

export type HouseTenantRefuseReason = 'internal_matching_book';

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

/**
 * Pin a house-tenant venue target. Internal matching book always refuses.
 * External kinds pass the door only — no extra preference vs other venues.
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
  return { ok: true, venueId: target.venueId, kind: target.kind };
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
