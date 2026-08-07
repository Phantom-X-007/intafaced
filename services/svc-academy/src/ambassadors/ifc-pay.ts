/**
 * Ambassador IFC pay / revenue share — Class M refuse-closed gate
 * (TRK-academy.ambassadors Stage next).
 *
 * Spec: docs/ops/trk/academy.ambassadors.md §4 Stage 2 — pay schedule,
 * recipes, and revenue-share definition are product law + ledger recipes.
 * Until those exist, every pay / share attempt FAILS CLOSED.
 *
 * NEVER invent IFC rates, bps, session fees, or ledger posts from academy.
 * Programme appoint/freeze remains non-money (programme.ts); residency
 * applications remain non-money (residency.ts).
 */

export type AmbassadorPayRefuseCode =
  | 'academy.ambassador_pay.rates_unset'
  | 'academy.ambassador_pay.class_m'
  | 'academy.ambassador_revenue_share.rates_unset'
  | 'academy.ambassador_revenue_share.class_m';

export type AmbassadorPayKind = 'ifc_pay' | 'revenue_share';

/**
 * Named refuse — operators / audits can grep the residual string.
 * No amount fields: inventing a decimal here would be a dual-book seed.
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

/** Stable residual for IFC session / schedule pay. */
export const AMBASSADOR_IFC_PAY_RESIDUAL =
  'TRK-academy.ambassadors Class M — IFC pay schedule + ledger recipe unset; refuse-closed (no invent rates)';

/** Stable residual for revenue share of fees. */
export const AMBASSADOR_REVENUE_SHARE_RESIDUAL =
  'TRK-academy.ambassadors Class M — revenue share basis + ledger recipe unset; refuse-closed (no invent fee %)';

/**
 * Always refuse IFC pay. Named residual — do not invent rates or post ledger.
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
 * Always refuse revenue share. Named residual — do not invent fee % or post ledger.
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
 * Unified entry: dry-run or live both refuse — academy must not simulate
 * invented amounts either (Class M honesty).
 */
export function refuseAmbassadorPayAttempt(input: { readonly kind: AmbassadorPayKind; readonly dryRun?: boolean }): never {
  // dryRun ignored on purpose — inventing a dry-run amount is still invent.
  void input.dryRun;
  if (input.kind === 'revenue_share') {
    refuseAmbassadorRevenueShare();
  }
  refuseAmbassadorIfcPay();
}

/** True when residual names Class M + refuse-closed (honesty guard). */
export function ambassadorPayResidualIsHonest(residual: string): boolean {
  return residual.includes('Class M') && residual.includes('refuse-closed') && residual.includes('no invent');
}

/** Ops board: pay plane is dark (never invent enabled=true). */
export type AmbassadorPayPlaneStatus = {
  readonly ifcPayEnabled: false;
  readonly revenueShareEnabled: false;
  readonly classM: true;
  readonly residualIfcPay: typeof AMBASSADOR_IFC_PAY_RESIDUAL;
  readonly residualRevenueShare: typeof AMBASSADOR_REVENUE_SHARE_RESIDUAL;
};

export function ambassadorPayPlaneStatus(): AmbassadorPayPlaneStatus {
  return {
    ifcPayEnabled: false,
    revenueShareEnabled: false,
    classM: true,
    residualIfcPay: AMBASSADOR_IFC_PAY_RESIDUAL,
    residualRevenueShare: AMBASSADOR_REVENUE_SHARE_RESIDUAL,
  };
}

/** One-line ops status — no money fields. */
export function ambassadorPayStatusLine(status: AmbassadorPayPlaneStatus = ambassadorPayPlaneStatus()): string {
  return `ifcPay=${status.ifcPayEnabled ? '1' : '0'} revenueShare=${status.revenueShareEnabled ? '1' : '0'} classM=${status.classM ? '1' : '0'}`;
}

/** True when status line shows both planes dark. */
export function ambassadorPayPlaneIsDark(status: AmbassadorPayPlaneStatus = ambassadorPayPlaneStatus()): boolean {
  return status.ifcPayEnabled === false && status.revenueShareEnabled === false && status.classM === true;
}

/**
 * Result-shaped refuse (for callers that catch rather than throw).
 * Never includes amount / rate fields.
 */
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
  // Unreachable — refuse always throws — keep TS exhaustive.
  return {
    ok: false,
    kind,
    code: kind === 'ifc_pay' ? 'academy.ambassador_pay.class_m' : 'academy.ambassador_revenue_share.class_m',
    residual: kind === 'ifc_pay' ? AMBASSADOR_IFC_PAY_RESIDUAL : AMBASSADOR_REVENUE_SHARE_RESIDUAL,
    message: 'unreachable',
  };
}

/** Export line for ops boards: kind,code (no invent amounts). */
export function ambassadorPayRefuseExportLine(result: AmbassadorPayRefuseResult): string {
  return `${result.kind},${result.code}`;
}

/** Header for refuse export. */
export function ambassadorPayRefuseExportHeader(): string {
  return 'kind,code';
}
