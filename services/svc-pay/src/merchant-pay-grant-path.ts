/**
 * Layer A call site — merchant `pay:*` grant path (D26-P1-P10).
 *
 * Invokes `@intafaced/auth` `assertMerchantPayScopeGrantAllowed` / named
 * `issueMerchantPayScopes` so onboarding never appends scopes ad hoc.
 * Tip law unpublished ⇒ refuse-closed. Never invents a grantor.
 *
 * Path fence: no dual-edit of #1720 KYB dossier writers; KYB status is only an
 * echo into the grant request for future owner-sealed predicates.
 */

import {
  MERCHANT_PAY_SCOPE_GRANT_RESIDUAL,
  MerchantPayScopeGrantError,
  assertMerchantPayScopeGrantAllowed,
  issueMerchantPayScopes,
  type MerchantPayScope,
  type MerchantPayScopeGrantRequest,
} from '@intafaced/auth';

export { MERCHANT_PAY_SCOPE_GRANT_RESIDUAL, MerchantPayScopeGrantError };

export type MerchantPayGrantPathRequest = MerchantPayScopeGrantRequest;

/**
 * Named issuance operation from the ADR. Always refuses until owner A2 seals.
 * Callers must not catch-and-ignore — surface the residual.
 */
export function issueMerchantPayScopesViaGrantPath(
  request: MerchantPayGrantPathRequest,
): { scopes: readonly MerchantPayScope[] } {
  return issueMerchantPayScopes(request);
}

/**
 * Gate-only form for call sites that check before building a credential.
 * Equivalent tip refuse to `issueMerchantPayScopesViaGrantPath`.
 */
export function assertMerchantPayGrantPathAllowed(request: MerchantPayGrantPathRequest): never {
  return assertMerchantPayScopeGrantAllowed(request);
}
