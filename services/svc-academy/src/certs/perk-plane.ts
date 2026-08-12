/**
 * Certifications D26-P1-C1 — Cert → XP → perks real or refuse (TRK-academy.certs).
 *
 * XP emit is Stage-2 (`xp-publish.ts`). Perks are NOT invented here:
 *   · Real path — read `rank_thresholds.perks` from svc-identity (§4.1 SoT).
 *   · Refuse path — any cert→perk money / invent map / IFC / fee invent fails closed.
 *
 * Academy never holds perk money, never posts ledger for a cert perk, and never
 * maintains a second opinion cert→perk table (that needs contracts + identity).
 */

import type { RankPerks } from '@intafaced/contracts';
import type { HostRightsSource } from '../host-rights.js';
import type { CertXpEmitResult } from './xp-publish.js';

export const CERT_PERK_REFUSE_CODE = 'academy.cert_perk_refuse_closed' as const;

/** Invent / money-shaped intents that academy must never honour on the cert path. */
export type CertPerkInventKind =
  | 'cert_to_perk_map'
  | 'invent_perk_money'
  | 'invent_fee_discount'
  | 'invent_ifc_grant'
  | 'invent_balance';

export const CERT_PERK_RESIDUAL =
  'TRK-academy.certs D26-P1-C1 — perks via svc-identity rank only; cert→perk money refuse-closed (no invent)';

export type CertPerkRefuse = {
  readonly status: 'refuse';
  readonly code: typeof CERT_PERK_REFUSE_CODE;
  readonly kind: CertPerkInventKind;
  readonly message: string;
  /** Always false — academy holds no perk book. */
  readonly academyHoldsPerkMoney: false;
  /** Always false — no cert→perk map in this service. */
  readonly academyMapsCertToPerk: false;
  readonly residual: typeof CERT_PERK_RESIDUAL;
};

export type CertPerkReal = {
  readonly status: 'real';
  /** Indirect only: XP → identity rank → rank_thresholds.perks. */
  readonly path: 'identity_rank';
  readonly sot: 'svc-identity';
  readonly academyHoldsPerkMoney: false;
  readonly academyMapsCertToPerk: false;
  readonly perks: RankPerks;
};

export type CertPerkOutcome =
  | CertPerkReal
  | {
      readonly status: 'refuse';
      readonly code: typeof CERT_PERK_REFUSE_CODE;
      readonly reason: 'identity_unreadable';
      readonly message: string;
      readonly academyHoldsPerkMoney: false;
      readonly academyMapsCertToPerk: false;
      readonly residual: typeof CERT_PERK_RESIDUAL;
    };

const INVENT_MESSAGE =
  'Cert perk money / cert→perk map is refuse-closed — perks come only from svc-identity rank after XP (§4.1); no invent';

/**
 * Decide any invent-shaped cert perk intent. Always refuse — never invent money.
 */
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
 * Hard assert — grant / progress payloads must not smuggle invent perk money fields.
 * Rank-only / XP-only fields are fine.
 */
export function assertNoCertPerkMoneyAttachment(payload: unknown): void {
  if (payload == null || typeof payload !== 'object') return;
  const o = payload as Record<string, unknown>;
  const banned = [
    'perkMoney',
    'perkAmount',
    'ifcPerk',
    'ifcGrant',
    'certPerkMap',
    'inventedFeeDiscountBps',
    'perkBalance',
    'perkPayout',
  ] as const;
  for (const key of banned) {
    if (key in o && o[key] != null) {
      throw Object.assign(new Error(INVENT_MESSAGE), { code: CERT_PERK_REFUSE_CODE });
    }
  }
}

/**
 * After cert + XP: surface real identity perks, or refuse when the SoT is unreadable.
 * Never invent a RankPerks table on failure.
 */
export async function resolveCertPerkOutcome(input: {
  readonly userId: string;
  readonly hostRights: HostRightsSource;
  /** XP result is informational — perks still come from identity, not from inventing on miss. */
  readonly xp: CertXpEmitResult;
}): Promise<CertPerkOutcome> {
  void input.xp;
  try {
    const perks = await input.hostRights.perksOf(input.userId);
    return {
      status: 'real',
      path: 'identity_rank',
      sot: 'svc-identity',
      academyHoldsPerkMoney: false,
      academyMapsCertToPerk: false,
      perks,
    };
  } catch {
    return {
      status: 'refuse',
      code: CERT_PERK_REFUSE_CODE,
      reason: 'identity_unreadable',
      message:
        'Identity perk table unreadable — refusing to invent cert perks (fail closed; grant + XP still durable)',
      academyHoldsPerkMoney: false,
      academyMapsCertToPerk: false,
      residual: CERT_PERK_RESIDUAL,
    };
  }
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

const INVENT_KINDS: readonly CertPerkInventKind[] = [
  'cert_to_perk_map',
  'invent_perk_money',
  'invent_fee_discount',
  'invent_ifc_grant',
  'invent_balance',
] as const;

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

/** True when residual names refuse-closed + no invent (honesty guard). */
export function certPerkResidualIsHonest(residual: string): boolean {
  return residual.includes('refuse-closed') && residual.includes('no invent') && residual.includes('svc-identity');
}

/** Export line for invent refuse: kind,code (no amounts). */
export function certPerkRefuseExportLine(decision: CertPerkRefuse): string {
  return `${decision.kind},${decision.code}`;
}

export function certPerkRefuseExportHeader(): string {
  return 'kind,code';
}

export function listCertPerkInventKinds(): readonly CertPerkInventKind[] {
  return INVENT_KINDS;
}
