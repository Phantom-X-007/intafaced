/**
 * Certifications Stage-2 — XP policy map (TRK-academy.certs).
 *
 * Pure mapping cert → XP delta string + stable idempotency key for
 * `intafaced.identity.xp.earned`. Does NOT post ledger money. Does NOT invent
 * perk tables — perks remain identity rank SoT.
 *
 * Emit path residual: wire to bus when academy owns publish of xpEarned;
 * this module only names the payload so double-award is impossible.
 */

import { certIdempotencyKey, type CertGrantRecord } from './progress.js';

export type CertXpPolicy = {
  readonly certId: string;
  /** Non-negative integer XP as decimal string (no float). */
  readonly xpDelta: string;
};

/** v0 policy — product may retune amounts; tests pin strings. */
export const CERT_XP_V0: readonly CertXpPolicy[] = [
  { certId: 'foundations-v1', xpDelta: '100' },
  { certId: 'markets-v1', xpDelta: '150' },
] as const;

export function xpPolicyFor(certId: string): CertXpPolicy | null {
  return CERT_XP_V0.find((p) => p.certId === certId) ?? null;
}

/**
 * L3 — XP delta string for a cert id. Unknown cert → null (never invent amount).
 */
export function xpDeltaForCert(certId: string): string | null {
  return xpPolicyFor(certId.trim())?.xpDelta ?? null;
}

/** L3 — sorted cert ids with a v0 XP policy. */
export function listXpPolicyCertIds(): readonly string[] {
  return CERT_XP_V0.map((p) => p.certId).sort();
}

export type XpEarnedIntent = {
  readonly userId: string;
  readonly certId: string;
  readonly xpDelta: string;
  /** Must match identity xp_events.idempotency_key shape for cert path. */
  readonly idempotencyKey: string;
  readonly source: 'academy.cert';
};

/**
 * Build xpEarned intent from a grant. Idempotency = cert grant key so re-grant
 * cannot double-award even if publish is retried.
 */
export function xpIntentFromGrant(grant: CertGrantRecord): XpEarnedIntent | null {
  const policy = xpPolicyFor(grant.certId);
  if (!policy) return null;
  if (!/^\d+$/.test(policy.xpDelta) || policy.xpDelta === '0') return null;
  return {
    userId: grant.userId,
    certId: grant.certId,
    xpDelta: policy.xpDelta,
    idempotencyKey: `academy.cert:${certIdempotencyKey(grant.userId, grant.certId)}`,
    source: 'academy.cert',
  };
}
