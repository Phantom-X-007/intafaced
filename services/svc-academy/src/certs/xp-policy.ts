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

/** L3 — true when cert has a v0 XP policy. Unknown → false (no invent). */
export function hasXpPolicy(certId: string): boolean {
  return xpPolicyFor(certId.trim()) !== null;
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

/** L3 — how many cert XP policies exist. */
export function xpPolicyCount(): number {
  return CERT_XP_V0.length;
}

/** L3 — true when XP policy catalog is non-empty. */
export function hasAnyXpPolicy(): boolean {
  return CERT_XP_V0.length > 0;
}

/** L3 — sorted policy cert ids joined. Empty → "". */
export function xpPolicyCertIdsJoined(): string {
  return listXpPolicyCertIds().join(',');
}

/** L3 — true when catalog has at least n policies. */
export function hasAtLeastXpPolicies(n: number): boolean {
  if (!Number.isFinite(n) || n < 0) return false;
  return CERT_XP_V0.length >= Math.floor(n);
}

/** L3 — xp policy board card for catalog. */
export function xpPolicyBoardCard(): {
  readonly count: number;
  readonly nonEmpty: boolean;
  readonly certIds: readonly string[];
  readonly idsJoined: string;
} {
  const certIds = listXpPolicyCertIds();
  return {
    count: xpPolicyCount(),
    nonEmpty: hasAnyXpPolicy(),
    certIds,
    idsJoined: xpPolicyCertIdsJoined(),
  };
}

/** L3 — export lines certId,xpDelta. Empty → []. */
export function xpPolicyExportLines(): readonly string[] {
  return CERT_XP_V0.map((p) => `${p.certId},${p.xpDelta}`).sort();
}

/** L3 — xp policy export header. */
export function xpPolicyExportHeader(): string {
  return 'certId,xpDelta';
}

/** L3 — full xp policy export text. */
export function xpPolicyExportText(): string {
  return [xpPolicyExportHeader(), ...xpPolicyExportLines()].join('\n');
}

/** L3 — parse xp policy export line. Invalid → null. */
export function parseXpPolicyExportLine(line: string): { readonly certId: string; readonly xpDelta: string } | null {
  const t = line.trim();
  if (!t || t === xpPolicyExportHeader()) return null;
  const parts = t.split(',');
  if (parts.length !== 2) return null;
  const certId = parts[0]!.trim();
  const xpDelta = parts[1]!.trim();
  if (!certId || !xpDelta) return null;
  return { certId, xpDelta };
}
