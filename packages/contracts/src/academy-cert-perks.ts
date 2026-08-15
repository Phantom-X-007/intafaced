import { z } from 'zod';
import { rankPerksSchema, type IdentityContract, type RankPerks } from './identity.js';

/**
 * ACADEMY CERT → IDENTITY PERK LAW (TRK-academy.certs).
 *
 * Cross-service product law. Academy's honesty plane (`certs/perk-plane.ts`) is
 * sealed locally; this file is the shared contract identity may import later.
 *
 *   · A cert grant is an XP source, never a perk grant.
 *   · Perks are read only from svc-identity `rank.perks` (§4.1 SoT).
 *   · Neither service holds a certId → perk table (that would be a second book).
 *   · Invent perk money / IFC / fee / balance is refuse-closed.
 *   · An unpriced cert publishes nothing.
 *   · This file carries no amounts, rank thresholds, or a second perk book.
 *
 * Deliberately absent on `IdentityContract`: `certPerk`, `grantCertPerk`,
 * `applyCertMap`. The only write a cert may cause is `rank.awardXp`. The only
 * perk read is `rank.perks`.
 */

export const CERT_PERK_REFUSE_CODE = 'academy.cert_perk_refuse_closed' as const;

export const certPerkInventKindSchema = z.enum([
  'cert_to_perk_map',
  'invent_perk_money',
  'invent_fee_discount',
  'invent_ifc_grant',
  'invent_balance',
]);
export type CertPerkInventKind = z.infer<typeof certPerkInventKindSchema>;

export const CERT_PERK_RESIDUAL =
  'TRK-academy.certs D26-P1-C1 — perks via svc-identity rank only; cert→perk money refuse-closed (no invent)';

export const CERT_PERK_BANNED_PAYLOAD_KEYS = [
  'perkMoney',
  'perkAmount',
  'ifcPerk',
  'ifcGrant',
  'certPerkMap',
  'inventedFeeDiscountBps',
  'perkBalance',
  'perkPayout',
] as const;
export type CertPerkBannedPayloadKey = (typeof CERT_PERK_BANNED_PAYLOAD_KEYS)[number];

/** Identity doors a cert-shaped caller must never grow. */
export const IDENTITY_FORBIDDEN_CERT_PERK_DOORS = ['certPerk', 'grantCertPerk', 'applyCertMap', 'certToPerk', 'certPerkMap'] as const;
export type IdentityForbiddenCertPerkDoor = (typeof IDENTITY_FORBIDDEN_CERT_PERK_DOORS)[number];

const INVENT_MESSAGE =
  'Cert perk money / cert→perk map is refuse-closed — perks come only from svc-identity rank after XP (§4.1); no invent';

const UNPRICED_MESSAGE = 'Unpriced cert publishes nothing — no XP, no identity perk grant, no invent perk money';

export const certPerkInventRefuseSchema = z.object({
  status: z.literal('refuse'),
  code: z.literal(CERT_PERK_REFUSE_CODE),
  kind: certPerkInventKindSchema,
  message: z.string().min(1),
  academyHoldsPerkMoney: z.literal(false),
  academyMapsCertToPerk: z.literal(false),
  residual: z.literal(CERT_PERK_RESIDUAL),
});
export type CertPerkRefuse = z.infer<typeof certPerkInventRefuseSchema>;

export const certPerkRealSchema = z.object({
  status: z.literal('real'),
  /** Indirect only: XP → identity rank → rank_thresholds.perks. */
  path: z.literal('identity_rank'),
  sot: z.literal('svc-identity'),
  academyHoldsPerkMoney: z.literal(false),
  academyMapsCertToPerk: z.literal(false),
  perks: rankPerksSchema,
});
export type CertPerkReal = z.infer<typeof certPerkRealSchema>;

export const certPerkRefuseReasonSchema = z.enum(['identity_unreadable', 'unpriced']);
export type CertPerkRefuseReason = z.infer<typeof certPerkRefuseReasonSchema>;

export const certPerkOutcomeRefuseSchema = z.object({
  status: z.literal('refuse'),
  code: z.literal(CERT_PERK_REFUSE_CODE),
  reason: certPerkRefuseReasonSchema,
  message: z.string().min(1),
  academyHoldsPerkMoney: z.literal(false),
  academyMapsCertToPerk: z.literal(false),
  residual: z.literal(CERT_PERK_RESIDUAL),
});

export const certPerkOutcomeSchema = z.discriminatedUnion('status', [certPerkRealSchema, certPerkOutcomeRefuseSchema]);
export type CertPerkOutcome = z.infer<typeof certPerkOutcomeSchema>;

const INVENT_KINDS: readonly CertPerkInventKind[] = certPerkInventKindSchema.options;

export const CERT_PERK_LAW = {
  sot: 'svc-identity',
  perkRead: 'rank.perks',
  certWrite: 'rank.awardXp',
  academyMapsCertToPerk: false,
  academyHoldsPerkMoney: false,
  identityAcceptsCertToPerkMap: false,
  inventKindsRefuseClosed: INVENT_KINDS,
  refuseCode: CERT_PERK_REFUSE_CODE,
} as const;
export type CertPerkLaw = typeof CERT_PERK_LAW;

/** The only identity doors a cert may use. */
export type CertPerkIdentityDoors = Pick<IdentityContract['rank'], 'awardXp' | 'perks'>;

export type CertPerkIdentityRead =
  { readonly ok: true; readonly perks: RankPerks } | { readonly ok: false; readonly reason: CertPerkRefuseReason };

export function decideCertPerkInvent(kind: CertPerkInventKind): CertPerkRefuse {
  return {
    status: 'refuse',
    code: CERT_PERK_REFUSE_CODE,
    kind,
    message: INVENT_MESSAGE,
    academyHoldsPerkMoney: false,
    academyMapsCertToPerk: false,
    residual: CERT_PERK_RESIDUAL,
  };
}

export function refuseCertToPerkMap(): CertPerkRefuse {
  return decideCertPerkInvent('cert_to_perk_map');
}

export function refuseInventPerkMoney(): CertPerkRefuse {
  return decideCertPerkInvent('invent_perk_money');
}

export function refuseInventFeeDiscount(): CertPerkRefuse {
  return decideCertPerkInvent('invent_fee_discount');
}

export function refuseInventIfcGrant(): CertPerkRefuse {
  return decideCertPerkInvent('invent_ifc_grant');
}

export function refuseInventPerkBalance(): CertPerkRefuse {
  return decideCertPerkInvent('invent_balance');
}

export function isCertPerkInventRefuseClosed(decision: CertPerkRefuse): boolean {
  return (
    decision.status === 'refuse' &&
    decision.code === CERT_PERK_REFUSE_CODE &&
    decision.academyHoldsPerkMoney === false &&
    decision.academyMapsCertToPerk === false
  );
}

/**
 * Grant / progress payloads must not smuggle invent perk money fields.
 * Rank-only / XP-only fields are fine. No amounts are invented here.
 */
export function assertNoCertPerkMoneyAttachment(payload: unknown): void {
  if (payload == null || typeof payload !== 'object') return;
  const o = payload as Record<string, unknown>;
  for (const key of CERT_PERK_BANNED_PAYLOAD_KEYS) {
    if (key in o && o[key] != null) {
      throw Object.assign(new Error(INVENT_MESSAGE), { code: CERT_PERK_REFUSE_CODE });
    }
  }
}

export function refuseUnpricedCertPerk(): Extract<CertPerkOutcome, { status: 'refuse' }> {
  return {
    status: 'refuse',
    code: CERT_PERK_REFUSE_CODE,
    reason: 'unpriced',
    message: UNPRICED_MESSAGE,
    academyHoldsPerkMoney: false,
    academyMapsCertToPerk: false,
    residual: CERT_PERK_RESIDUAL,
  };
}

export function refuseIdentityUnreadable(): Extract<CertPerkOutcome, { status: 'refuse' }> {
  return {
    status: 'refuse',
    code: CERT_PERK_REFUSE_CODE,
    reason: 'identity_unreadable',
    message: 'Identity perk table unreadable — refusing to invent cert perks (fail closed; grant + XP still durable)',
    academyHoldsPerkMoney: false,
    academyMapsCertToPerk: false,
    residual: CERT_PERK_RESIDUAL,
  };
}

/**
 * Pure consumer of an identity perk read (or a refuse reason).
 * Callers supply what `rank.perks` returned — this never invents a table.
 */
export function certPerkFromIdentityRead(read: CertPerkIdentityRead): CertPerkOutcome {
  if (!read.ok) {
    return read.reason === 'unpriced' ? refuseUnpricedCertPerk() : refuseIdentityUnreadable();
  }
  return {
    status: 'real',
    path: 'identity_rank',
    sot: 'svc-identity',
    academyHoldsPerkMoney: false,
    academyMapsCertToPerk: false,
    perks: read.perks,
  };
}

export type CertPerkPlaneStatus = {
  readonly perksEnabledViaIdentity: true;
  readonly academyMapsCertToPerk: false;
  readonly academyHoldsPerkMoney: false;
  readonly rankWriter: 'svc-identity';
  readonly residual: typeof CERT_PERK_RESIDUAL;
  readonly inventKindsRefuseClosed: readonly CertPerkInventKind[];
  readonly statusLine: string;
};

export function certPerkPlaneStatus(): CertPerkPlaneStatus {
  return {
    perksEnabledViaIdentity: true,
    academyMapsCertToPerk: false,
    academyHoldsPerkMoney: false,
    rankWriter: 'svc-identity',
    residual: CERT_PERK_RESIDUAL,
    inventKindsRefuseClosed: INVENT_KINDS,
    statusLine: certPerkPlaneStatusLine(),
  };
}

export function certPerkPlaneStatusLine(): string {
  return `perks=identity_rank sot=svc-identity academyMap=0 perkMoney=0 code=${CERT_PERK_REFUSE_CODE}`;
}

export function certPerkResidualIsHonest(residual: string): boolean {
  return residual.includes('refuse-closed') && residual.includes('no invent') && residual.includes('svc-identity');
}

export function certPerkRefuseExportLine(decision: CertPerkRefuse): string {
  return `${decision.kind},${decision.code}`;
}

export function certPerkRefuseExportHeader(): string {
  return 'kind,code';
}

export function listCertPerkInventKinds(): readonly CertPerkInventKind[] {
  return INVENT_KINDS;
}

export function identitySurfaceLooksLikeCertPerkMap(value: object): boolean {
  return IDENTITY_FORBIDDEN_CERT_PERK_DOORS.some((key) => key in value);
}

export function certPerkLaw(): CertPerkLaw {
  return CERT_PERK_LAW;
}
