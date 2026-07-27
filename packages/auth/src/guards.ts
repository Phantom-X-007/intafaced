import { AuthError, type Principal } from './tokens.js';
import { INTERACTIVE_ONLY_SCOPES, expandScopes, type Scope } from './scopes.js';

/**
 * Guards — the authorisation checks every service applies before doing work.
 *
 * These are plain functions rather than framework middleware so the same rule
 * is enforced identically from Fastify, from tRPC, from a queue worker, and
 * from an agent tool call. A guard throws; it never returns a boolean that a
 * caller can forget to check.
 */

export function requireScope(principal: Principal, scope: Scope): void {
  const granted = expandScopes(principal.scopes);

  if (!granted.has(scope)) {
    throw new AuthError(`Scope "${scope}" is required`, 'scope.denied');
  }

  // A scope that can move value off the platform needs a 2FA-backed session,
  // no matter how it was granted (§9).
  if ((INTERACTIVE_ONLY_SCOPES as readonly string[]).includes(scope) && !principal.mfa) {
    throw new AuthError(`Scope "${scope}" requires two-factor authentication`, 'mfa.required');
  }
}

export function requireAllScopes(principal: Principal, scopes: readonly Scope[]): void {
  for (const scope of scopes) requireScope(principal, scope);
}

export function requireMfa(principal: Principal): void {
  if (!principal.mfa) throw new AuthError('This action requires two-factor authentication', 'mfa.required');
}

export const TIER_ORDER = { none: 0, basic: 1, full: 2, institutional: 3 } as const;

export function requireTier(principal: Principal, tier: Principal['tier']): void {
  if (TIER_ORDER[principal.tier] < TIER_ORDER[tier]) {
    throw new AuthError(`Verification tier "${tier}" is required`, 'scope.denied');
  }
}

/**
 * Ownership check. A principal may act on its own resources, and on its own
 * sub-accounts — never on another user's, whatever scopes it holds.
 */
export function requireOwnership(principal: Principal, ownerUserId: string): void {
  if (principal.userId !== ownerUserId) {
    throw new AuthError('This resource belongs to another account', 'scope.denied');
  }
}

/** Extract a bearer token from an Authorization header. */
export function bearerToken(header: string | undefined | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
