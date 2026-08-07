import type { Principal } from '@intafaced/auth';
import { P2pError, isNaturalPersonId } from './p2p-service.js';

/**
 * MODERATION REACHABILITY (D-S-08 residual).
 *
 * `admin:compliance` still authorises a moderator when a principal actually
 * carries it (tests, future operator issuance). SESSION_SCOPES deliberately
 * withholds that scope from every logged-in account — so a deployment that
 * only checks the scope has a mounted queue nobody can authenticate into.
 *
 * `P2P_MODERATOR_USER_IDS` is the operator control that closes that gap
 * without widening a platform scope (DIRECTION §3 / owner sign-off for
 * `p2p:moderate`). Named natural-person ids may moderate with ordinary
 * `p2p:read`. An empty list is not a soft default: it means moderation is
 * not configured, and the API must refuse rather than pretend a human can
 * reach the queue. (Stage residual — no fake adjudication.)
 */

/** Comma / whitespace separated canonical UUIDs. Invalid tokens are refused. */
export function parseModeratorUserIds(raw: string | undefined | null): readonly string[] {
  if (raw == null || raw.trim() === '') return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,]+/)) {
    if (part === '') continue;
    const id = part.toLowerCase();
    if (!isNaturalPersonId(id)) {
      throw new Error(
        `P2P_MODERATOR_USER_IDS entry "${part}" is not a lowercase canonical UUID — refusing to start with a broken moderator allowlist`,
      );
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** True when the deployment named at least one person who can moderate. */
export function isModerationConfigured(moderatorUserIds: readonly string[]): boolean {
  return moderatorUserIds.length > 0;
}

/**
 * A principal is a moderator when they hold `admin:compliance` OR their user
 * id is on the allowlist. The allowlist path is what makes a real session
 * reachable; the scope path remains for tests and any future operator grant.
 */
export function isModerator(principal: Pick<Principal, 'userId' | 'scopes'>, moderatorUserIds: readonly string[]): boolean {
  if (principal.scopes.includes('admin:compliance')) return true;
  if (!isNaturalPersonId(principal.userId)) return false;
  return moderatorUserIds.includes(principal.userId.toLowerCase());
}

/**
 * Gate for list / resolve. Distinguishes "nobody can moderate here" from
 * "you are not one of the people who can".
 */
export function assertModerator(principal: Pick<Principal, 'userId' | 'scopes'>, moderatorUserIds: readonly string[]): void {
  if (isModerator(principal, moderatorUserIds)) return;

  if (!isModerationConfigured(moderatorUserIds)) {
    throw new P2pError(
      'P2P moderation is not configured — set P2P_MODERATOR_USER_IDS to the natural-person ids of human moderators (admin:compliance remains valid when a principal holds it). Escrow stays held; no automatic ruling.',
      'p2p.moderation_unreachable',
    );
  }

  throw new P2pError(
    'Moderator authority required — your session is not on P2P_MODERATOR_USER_IDS and does not hold admin:compliance',
    'p2p.not_a_moderator',
  );
}
