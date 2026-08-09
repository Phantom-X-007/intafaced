/**
 * Certifications Stage-2 — XP policy map (TRK-academy.certs).
 *
 * Pure mapping cert → XP delta string + stable idempotency key for
 * `intafaced.identity.xp.earned`. Does NOT post ledger money. Does NOT invent
 * perk tables — perks remain identity rank SoT.
 *
 * Emit path is live: `xp-publish.ts` + `grantCert` publish the intent. This
 * module only names the payload so double-award is impossible (same key +
 * identity ON CONFLICT). Unpriced certs publish nothing rather than invent XP.
 */

import { certIdempotencyKey, type CertGrantRecord } from './progress.js';
import { listCertCatalog } from './catalog.js';

export type CertXpPolicy = {
  readonly certId: string;
  /** Non-negative integer XP as decimal string (no float). */
  readonly xpDelta: string;
};

/** v0 policy — product may retune amounts; tests pin strings. */
export const CERT_XP_V0: readonly CertXpPolicy[] = [
  // Only certs that exist in CERT_CATALOG. markets-v1 was a ghost — plane advertised
  // XP for a cert nobody can grant. Add rows here only when catalog + product law land.
  { certId: 'foundations-v1', xpDelta: '100' },
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

/** L3 — data-line count excluding header. */
export function countXpPolicyExportDataLines(text: string): number {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== xpPolicyExportHeader()).length;
}

/** L3 — true when export has header. */
export function xpPolicyExportHasHeader(text: string): boolean {
  const first = text.split('\n')[0]?.trim() ?? '';
  return first === xpPolicyExportHeader();
}

/** L3 — round-trip for xp policy export. */
export function xpPolicyExportRoundTripOk(): boolean {
  const text = xpPolicyExportText();
  return text.split('\n').filter(Boolean).length === 1 + countXpPolicyExportDataLines(text);
}

/** L3 — xp policy status line. */
export function xpPolicyStatusLine(): string {
  const c = xpPolicyBoardCard();
  return `count=${c.count} nonEmpty=${c.nonEmpty ? '1' : '0'}`;
}

/** L3 — true when count is 0. */
export function xpPolicyStatusLineIsEmpty(): boolean {
  return xpPolicyCount() === 0;
}

/** L3 — detailed xp policy status. */
export function xpPolicyStatusLineDetailed(): string {
  const c = xpPolicyBoardCard();
  return `count=${c.count} nonEmpty=${c.nonEmpty ? '1' : '0'} ids=${c.idsJoined || '-'}`;
}

/** L3 — parse xp policy status. Invalid → null. */
export function parseXpPolicyStatusLine(line: string): { readonly count: number; readonly nonEmpty: boolean } | null {
  const m = line.trim().match(/^count=(\d+) nonEmpty=([01])$/);
  if (!m) return null;
  return { count: Number(m[1]), nonEmpty: m[2] === '1' };
}

/** L3 — true when status matches catalog. */
export function xpPolicyStatusLineMatches(): boolean {
  const p = parseXpPolicyStatusLine(xpPolicyStatusLine());
  if (!p) return false;
  return p.count === xpPolicyCount() && p.nonEmpty === hasAnyXpPolicy();
}

/** L3 — true when nonEmpty flag matches count>0. */
export function xpPolicyStatusLineConsistent(line: string): boolean {
  const p = parseXpPolicyStatusLine(line);
  if (!p) return false;
  return p.nonEmpty === p.count > 0;
}

/** L3 — true when policy count is within [min,max]. Invalid → false. */
export function xpPolicyCountInRange(min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = xpPolicyCount();
  return n >= min && n <= max;
}

/**
 * Every XP policy certId must be grantable — present in CERT_CATALOG.
 * A policy without a definition is a ghost that certXpPlane would advertise.
 */
export function xpPolicyCatalogConsistent(): boolean {
  const catalogIds = new Set(listCertCatalog().map((c) => c.id));
  return CERT_XP_V0.every((p) => catalogIds.has(p.certId));
}

/** L3 — policy cert ids missing from the grantable catalog. Empty when honest. */
export function xpPolicyGhostCertIds(): readonly string[] {
  const catalogIds = new Set(listCertCatalog().map((c) => c.id));
  return CERT_XP_V0.filter((p) => !catalogIds.has(p.certId)).map((p) => p.certId);
}
