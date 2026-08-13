/**
 * Merchant acquiring scope grant — mechanism + named issuance (D26-P0-08 → P1-P10).
 *
 * Law: DIRECTION §8 item 4 / §3 merchant onboarding — who grants `pay:*` and
 * after what KYB check is OWNER-ONLY. Refuse-closed until owner A2 seals.
 * Call sites (svc-pay grant path) must invoke these ops — never append scopes.
 *
 * ADR: docs/adr/2026-08-12-pay-write-kyb-grant-mechanism-shape.md
 */

import { isScope, type Scope } from './scopes.js';

/** The four merchant acquiring scopes withheld from ordinary sessions. */
export const MERCHANT_PAY_SCOPES = ['pay:read', 'pay:write', 'pay:refund', 'pay:payout'] as const;

export type MerchantPayScope = (typeof MERCHANT_PAY_SCOPES)[number];

/**
 * Stable residual — never invent a grantor, KYB threshold, or session issuance.
 * Pattern matches copy fee-share refuse-closed (DIRECTION §8).
 */
export const MERCHANT_PAY_SCOPE_GRANT_RESIDUAL =
  'DIRECTION §8 item 4 — pay:* merchant scope grant is owner-only; refuse-closed (never invent grants or KYB thresholds)';

export type MerchantPayScopeGrantErrorCode = 'auth.merchant_pay_scope_grant_unpublished';

export class MerchantPayScopeGrantError extends Error {
  constructor(
    message: string,
    readonly code: MerchantPayScopeGrantErrorCode,
    readonly residual: string = MERCHANT_PAY_SCOPE_GRANT_RESIDUAL,
  ) {
    super(message);
    this.name = 'MerchantPayScopeGrantError';
  }
}

export type MerchantPayScopeGrantRequest = {
  /** Merchant whose acquiring surface would receive scopes. */
  merchantId: string;
  /** Scopes requested — must be a subset of MERCHANT_PAY_SCOPES. */
  scopes: readonly string[];
  /**
   * Optional KYB status echo for future law readers.
   * Tip refuse does not approve on any value — including `approved`.
   */
  kybStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  /** Optional actor claiming grant authority — tip refuse ignores it. */
  actorUserId?: string;
};

function assertMerchantPayScopes(scopes: readonly string[]): asserts scopes is readonly MerchantPayScope[] {
  if (scopes.length === 0) {
    throw new MerchantPayScopeGrantError(
      'merchant pay scope grant requires at least one pay:* scope',
      'auth.merchant_pay_scope_grant_unpublished',
    );
  }
  for (const scope of scopes) {
    if (!isScope(scope) || !(MERCHANT_PAY_SCOPES as readonly string[]).includes(scope)) {
      throw new MerchantPayScopeGrantError(
        `scope "${scope}" is not a merchant acquiring pay:* scope`,
        'auth.merchant_pay_scope_grant_unpublished',
      );
    }
  }
}

/**
 * Gate for issuing merchant `pay:*` scopes.
 *
 * Tip behaviour: always refuse. Owner-published grant law replaces the body;
 * call sites keep this contract (`issueMerchantPayScopes` is the named op).
 *
 * Deliberately does **not** treat `kybStatus: 'approved'` as permission to grant.
 */
export function assertMerchantPayScopeGrantAllowed(request: MerchantPayScopeGrantRequest): never {
  assertMerchantPayScopes(request.scopes);
  // kybStatus / actorUserId intentionally unused on tip — reading them into an
  // allow path would invent the owner seal. Future law may require them.
  void request.merchantId;
  void request.kybStatus;
  void request.actorUserId;
  throw new MerchantPayScopeGrantError(
    'merchant pay:* scope grant law is unpublished',
    'auth.merchant_pay_scope_grant_unpublished',
    MERCHANT_PAY_SCOPE_GRANT_RESIDUAL,
  );
}

/**
 * Named issuance operation (ADR A1). Tip: refuse via the gate — never returns
 * scopes. Owner seal later replaces the gate body; this signature stays.
 */
export function issueMerchantPayScopes(request: MerchantPayScopeGrantRequest): { scopes: readonly MerchantPayScope[] } {
  assertMerchantPayScopeGrantAllowed(request);
}

/** Type guard helper for callers assembling grant requests. */
export function isMerchantPayScope(scope: Scope | string): scope is MerchantPayScope {
  return (MERCHANT_PAY_SCOPES as readonly string[]).includes(scope);
}
