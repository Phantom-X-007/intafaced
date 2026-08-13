/**
 * Ambassador IFC pay / revenue share — under rate authority (D26-P1-C2).
 *
 * Spec: docs/ops/trk/academy.ambassadors.md §4 Stage 2.
 *
 * Rules:
 *   1. Never invent IFC rates / fee % — resolve only via ifc-pay-rate-law.ts
 *   2. Product path when rate authority is published (dry-run quote)
 *   3. Live settlement stays refuse-closed until a Class M ledger recipe exists
 *      (ambassadors hold no balance; no recipes imported here)
 *   4. Residencies: accepted residency is the residency product gate for IFC quote
 *
 * Programme appoint/freeze remains non-money (programme.ts).
 */

import type { ResidencyStatus } from './residency.js';
import {
  AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL,
  AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL,
  AmbassadorRateAuthorityRefuseError,
  ambassadorIfcPayLawIsPublished,
  ambassadorRevenueShareLawIsPublished,
  resolveAmbassadorIfcPayLaw,
  resolveAmbassadorRevenueShareLaw,
  type AmbassadorIfcPayLaw,
  type AmbassadorRevenueShareLaw,
  UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW,
  UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW,
} from './ifc-pay-rate-law.js';

export type AmbassadorPayRefuseCode =
  | 'academy.ambassador_pay.rates_unset'
  | 'academy.ambassador_pay.class_m'
  | 'academy.ambassador_pay.recipe_unset'
  | 'academy.ambassador_pay.residency_not_accepted'
  | 'academy.ambassador_revenue_share.rates_unset'
  | 'academy.ambassador_revenue_share.class_m'
  | 'academy.ambassador_revenue_share.recipe_unset'
  | 'academy.ambassador_revenue_share.residency_not_accepted';

export type AmbassadorPayKind = 'ifc_pay' | 'revenue_share';

/**
 * Named refuse — operators / audits can grep the residual string.
 * No amount fields on refuse: inventing a decimal here would be a dual-book seed.
 */
export class AmbassadorPayRefuseError extends Error {
  constructor(
    message: string,
    readonly code: AmbassadorPayRefuseCode,
    readonly residual: string,
    readonly kind: AmbassadorPayKind,
  ) {
    super(message);
    this.name = 'AmbassadorPayRefuseError';
  }
}

/** Stable residual for IFC session / schedule pay when rates OR recipe unset. */
export const AMBASSADOR_IFC_PAY_RESIDUAL =
  'TRK-academy.ambassadors Class M — IFC pay schedule + ledger recipe unset; refuse-closed (no invent rates)';

/** Stable residual for revenue share of fees when rates OR recipe unset. */
export const AMBASSADOR_REVENUE_SHARE_RESIDUAL =
  'TRK-academy.ambassadors Class M — revenue share basis + ledger recipe unset; refuse-closed (no invent fee %)';

/** Settlement-only residual — rates may be published; recipe still missing. */
export const AMBASSADOR_IFC_PAY_RECIPE_RESIDUAL =
  'TRK-academy.ambassadors Class M — ledger recipe unset; rate authority present but settlement refuse-closed';

export const AMBASSADOR_REVENUE_SHARE_RECIPE_RESIDUAL =
  'TRK-academy.ambassadors Class M — ledger recipe unset; revenue-share rate authority present but settlement refuse-closed';

export const AMBASSADOR_RESIDENCY_GATE_RESIDUAL =
  'TRK-academy.ambassadors — residency must be accepted before IFC / share quote under rate authority';

function mapRateRefuse(err: AmbassadorRateAuthorityRefuseError, kind: AmbassadorPayKind): never {
  throw new AmbassadorPayRefuseError(err.message, err.code, err.residual, kind);
}

/**
 * Always refuse IFC pay when no law is supplied (legacy call sites / unset authority).
 */
export function refuseAmbassadorIfcPay(): never {
  throw new AmbassadorPayRefuseError(
    'Ambassador IFC pay is refuse-closed until owner-published pay schedule and a ledger recipe exist',
    'academy.ambassador_pay.rates_unset',
    AMBASSADOR_IFC_PAY_RESIDUAL,
    'ifc_pay',
  );
}

/**
 * Always refuse revenue share when no law is supplied.
 */
export function refuseAmbassadorRevenueShare(): never {
  throw new AmbassadorPayRefuseError(
    'Ambassador revenue share is refuse-closed until owner-published share basis and a ledger recipe exist',
    'academy.ambassador_revenue_share.rates_unset',
    AMBASSADOR_REVENUE_SHARE_RESIDUAL,
    'revenue_share',
  );
}

/**
 * Unified legacy entry without law — always refuse (dry-run included).
 * Prefer attemptAmbassadorPay under rate authority.
 */
export function refuseAmbassadorPayAttempt(input: { readonly kind: AmbassadorPayKind; readonly dryRun?: boolean }): never {
  void input.dryRun;
  if (input.kind === 'revenue_share') {
    refuseAmbassadorRevenueShare();
  }
  refuseAmbassadorIfcPay();
}

/** True when residual names Class M / DIRECTION refuse honesty. */
export function ambassadorPayResidualIsHonest(residual: string): boolean {
  const namesClassOrDirection = residual.includes('Class M') || residual.includes('DIRECTION §8');
  const namesRefuse = residual.includes('refuse-closed') || residual.includes('must be accepted');
  const namesNoInvent = residual.includes('no invent') || residual.includes('never invent') || residual.includes('residency');
  return namesClassOrDirection && namesRefuse && namesNoInvent;
}

/**
 * Ops board plane status.
 * Settlement flags stay false forever on this Stage (no recipe).
 * Rate-authority published flags open the dry-run quote product path.
 */
export type AmbassadorPayPlaneStatus = {
  readonly ifcPayEnabled: false;
  readonly revenueShareEnabled: false;
  readonly ifcRateAuthorityPublished: boolean;
  readonly revenueShareRateAuthorityPublished: boolean;
  readonly ifcPayQuoteEnabled: boolean;
  readonly revenueShareQuoteEnabled: boolean;
  readonly classM: true;
  readonly residualIfcPay:
    typeof AMBASSADOR_IFC_PAY_RESIDUAL | typeof AMBASSADOR_IFC_PAY_RECIPE_RESIDUAL | typeof AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL;
  readonly residualRevenueShare:
    | typeof AMBASSADOR_REVENUE_SHARE_RESIDUAL
    | typeof AMBASSADOR_REVENUE_SHARE_RECIPE_RESIDUAL
    | typeof AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL;
};

export function ambassadorPayPlaneStatus(
  laws: {
    readonly ifc?: AmbassadorIfcPayLaw;
    readonly revenueShare?: AmbassadorRevenueShareLaw;
  } = {},
): AmbassadorPayPlaneStatus {
  const ifc = laws.ifc ?? UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW;
  const revenueShare = laws.revenueShare ?? UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW;
  const ifcPublished = ambassadorIfcPayLawIsPublished(ifc);
  const sharePublished = ambassadorRevenueShareLawIsPublished(revenueShare);
  return {
    ifcPayEnabled: false,
    revenueShareEnabled: false,
    ifcRateAuthorityPublished: ifcPublished,
    revenueShareRateAuthorityPublished: sharePublished,
    ifcPayQuoteEnabled: ifcPublished,
    revenueShareQuoteEnabled: sharePublished,
    classM: true,
    residualIfcPay: ifcPublished ? AMBASSADOR_IFC_PAY_RECIPE_RESIDUAL : AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL,
    residualRevenueShare: sharePublished ? AMBASSADOR_REVENUE_SHARE_RECIPE_RESIDUAL : AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL,
  };
}

/** One-line ops status — no money fields. */
export function ambassadorPayStatusLine(status: AmbassadorPayPlaneStatus = ambassadorPayPlaneStatus()): string {
  return (
    `ifcPay=${status.ifcPayEnabled ? '1' : '0'} revenueShare=${status.revenueShareEnabled ? '1' : '0'} ` +
    `ifcAuth=${status.ifcRateAuthorityPublished ? '1' : '0'} shareAuth=${status.revenueShareRateAuthorityPublished ? '1' : '0'} ` +
    `classM=${status.classM ? '1' : '0'}`
  );
}

/** True when settlement plane is dark (never invent enabled=true for settlement). */
export function ambassadorPayPlaneIsDark(status: AmbassadorPayPlaneStatus = ambassadorPayPlaneStatus()): boolean {
  return status.ifcPayEnabled === false && status.revenueShareEnabled === false && status.classM === true;
}

export type AmbassadorPayRefuseResult = {
  readonly ok: false;
  readonly kind: AmbassadorPayKind;
  readonly code: AmbassadorPayRefuseCode;
  readonly residual: string;
  readonly message: string;
};

export function tryRefuseAmbassadorPay(kind: AmbassadorPayKind): AmbassadorPayRefuseResult {
  try {
    refuseAmbassadorPayAttempt({ kind });
  } catch (err) {
    if (err instanceof AmbassadorPayRefuseError) {
      return {
        ok: false,
        kind: err.kind,
        code: err.code,
        residual: err.residual,
        message: err.message,
      };
    }
    throw err;
  }
  return {
    ok: false,
    kind,
    code: kind === 'ifc_pay' ? 'academy.ambassador_pay.class_m' : 'academy.ambassador_revenue_share.class_m',
    residual: kind === 'ifc_pay' ? AMBASSADOR_IFC_PAY_RESIDUAL : AMBASSADOR_REVENUE_SHARE_RESIDUAL,
    message: 'unreachable',
  };
}

export function ambassadorPayRefuseExportLine(result: AmbassadorPayRefuseResult): string {
  return `${result.kind},${result.code}`;
}

export function ambassadorPayRefuseExportHeader(): string {
  return 'kind,code';
}

function assertResidencyGate(residencyStatus: ResidencyStatus | null | undefined, kind: AmbassadorPayKind): void {
  if (residencyStatus == null) return; // operator path without residency row
  if (residencyStatus !== 'accepted') {
    throw new AmbassadorPayRefuseError(
      'Ambassador pay quote requires an accepted residency under rate authority',
      kind === 'ifc_pay' ? 'academy.ambassador_pay.residency_not_accepted' : 'academy.ambassador_revenue_share.residency_not_accepted',
      AMBASSADOR_RESIDENCY_GATE_RESIDUAL,
      kind,
    );
  }
}

/** Dry-run quote under owner-published IFC rate authority — amounts from law only. */
export type AmbassadorIfcPayQuote = {
  readonly ok: true;
  readonly kind: 'ifc_pay';
  readonly dryRun: true;
  readonly authority: 'owner_published';
  readonly beneficiaryId: string;
  readonly sessionCredit: string;
  readonly asset: string;
  readonly period: string;
  readonly residencyStatus: ResidencyStatus | null;
  /** Settlement always dark here — no ledger recipe in ambassadors. */
  readonly settlement: 'refuse_recipe_unset';
};

/** Dry-run quote under owner-published revenue-share rate authority. */
export type AmbassadorRevenueShareQuote = {
  readonly ok: true;
  readonly kind: 'revenue_share';
  readonly dryRun: true;
  readonly authority: 'owner_published';
  readonly beneficiaryId: string;
  readonly shareOfFeeBps: number;
  readonly feeBasis: string;
  readonly residencyStatus: ResidencyStatus | null;
  readonly settlement: 'refuse_recipe_unset';
};

export type AmbassadorPayAttemptInput = {
  readonly kind: AmbassadorPayKind;
  readonly law: AmbassadorIfcPayLaw | AmbassadorRevenueShareLaw;
  readonly beneficiaryId: string;
  readonly dryRun?: boolean;
  readonly residencyStatus?: ResidencyStatus | null;
  readonly requestLaw?: AmbassadorIfcPayLaw | AmbassadorRevenueShareLaw | null;
};

/**
 * Product path under rate authority.
 *
 * - rates unset → rates_unset refuse
 * - residency present but not accepted → residency_not_accepted
 * - rates published + dryRun → quote (amounts from authority only)
 * - rates published + live → recipe_unset refuse (Class M honesty — no invent settlement)
 */
export function attemptAmbassadorPay(input: AmbassadorPayAttemptInput): AmbassadorIfcPayQuote | AmbassadorRevenueShareQuote {
  const beneficiaryId = input.beneficiaryId.trim();
  if (!beneficiaryId) {
    throw new AmbassadorPayRefuseError(
      'beneficiaryId required',
      input.kind === 'ifc_pay' ? 'academy.ambassador_pay.class_m' : 'academy.ambassador_revenue_share.class_m',
      input.kind === 'ifc_pay' ? AMBASSADOR_IFC_PAY_RESIDUAL : AMBASSADOR_REVENUE_SHARE_RESIDUAL,
      input.kind,
    );
  }

  assertResidencyGate(input.residencyStatus, input.kind);

  if (input.kind === 'ifc_pay') {
    let published: Extract<AmbassadorIfcPayLaw, { published: true }>;
    try {
      published = resolveAmbassadorIfcPayLaw({
        law: input.law as AmbassadorIfcPayLaw,
        requestLaw: input.requestLaw as AmbassadorIfcPayLaw | null | undefined,
      });
    } catch (err) {
      if (err instanceof AmbassadorRateAuthorityRefuseError) mapRateRefuse(err, 'ifc_pay');
      throw err;
    }

    if (!input.dryRun) {
      throw new AmbassadorPayRefuseError(
        'Ambassador IFC settlement is refuse-closed until a Class M ledger recipe exists',
        'academy.ambassador_pay.recipe_unset',
        AMBASSADOR_IFC_PAY_RECIPE_RESIDUAL,
        'ifc_pay',
      );
    }

    return {
      ok: true,
      kind: 'ifc_pay',
      dryRun: true,
      authority: 'owner_published',
      beneficiaryId,
      sessionCredit: published.sessionCredit,
      asset: published.asset,
      period: published.period,
      residencyStatus: input.residencyStatus ?? null,
      settlement: 'refuse_recipe_unset',
    };
  }

  let publishedShare: Extract<AmbassadorRevenueShareLaw, { published: true }>;
  try {
    publishedShare = resolveAmbassadorRevenueShareLaw({
      law: input.law as AmbassadorRevenueShareLaw,
      requestLaw: input.requestLaw as AmbassadorRevenueShareLaw | null | undefined,
    });
  } catch (err) {
    if (err instanceof AmbassadorRateAuthorityRefuseError) mapRateRefuse(err, 'revenue_share');
    throw err;
  }

  if (!input.dryRun) {
    throw new AmbassadorPayRefuseError(
      'Ambassador revenue-share settlement is refuse-closed until a Class M ledger recipe exists',
      'academy.ambassador_revenue_share.recipe_unset',
      AMBASSADOR_REVENUE_SHARE_RECIPE_RESIDUAL,
      'revenue_share',
    );
  }

  return {
    ok: true,
    kind: 'revenue_share',
    dryRun: true,
    authority: 'owner_published',
    beneficiaryId,
    shareOfFeeBps: publishedShare.shareOfFeeBps,
    feeBasis: publishedShare.feeBasis,
    residencyStatus: input.residencyStatus ?? null,
    settlement: 'refuse_recipe_unset',
  };
}

/**
 * Residency IFC product path: accepted residency + rate authority → dry-run quote.
 */
export function attemptResidencyIfcPay(input: {
  readonly law: AmbassadorIfcPayLaw;
  readonly beneficiaryId: string;
  readonly residencyStatus: ResidencyStatus;
  readonly dryRun?: boolean;
}): AmbassadorIfcPayQuote {
  return attemptAmbassadorPay({
    kind: 'ifc_pay',
    law: input.law,
    beneficiaryId: input.beneficiaryId,
    residencyStatus: input.residencyStatus,
    dryRun: input.dryRun ?? true,
  }) as AmbassadorIfcPayQuote;
}
