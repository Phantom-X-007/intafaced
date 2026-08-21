/**
 * Ambassador IFC pay / revenue-share rate authority (D26-P1-C2).
 *
 * DIRECTION §8 — rates are owner-only. Blank / unpublished → refuse-closed.
 * Never invent session credits, fee %, or bps as platform defaults.
 *
 * Mirrors services/svc-identity/src/affiliates/commission-rate-law.ts
 * (D26-P1-O2 accrual under rate authority).
 *
 * Spec: docs/ops/trk/academy.ambassadors.md §4 Stage 2 + DENON-HARD C2.
 * Settlement still needs a Class M ledger recipe (separate) — this module
 * only publishes / resolves the rate schedule.
 */

export type AmbassadorIfcPayLaw =
  | { readonly published: false }
  | {
      readonly published: true;
      /** Owner-published IFC credit per paid session (decimal string). */
      readonly sessionCredit: string;
      /** Asset code owner named for this schedule (e.g. IFC). */
      readonly asset: string;
      /** Owner-named schedule period (opaque string — product law). */
      readonly period: string;
    };

export type AmbassadorRevenueShareLaw =
  | { readonly published: false }
  | {
      readonly published: true;
      /** Share of the named fee basis in bps (0..10000). Owner-published only. */
      readonly shareOfFeeBps: number;
      /** Owner-named fee basis (e.g. lobby_host_fees) — never invent %. */
      readonly feeBasis: string;
    };

/** Production default — no invent. */
export const UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW: AmbassadorIfcPayLaw = { published: false };
export const UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW: AmbassadorRevenueShareLaw = { published: false };

/**
 * Stable residual — grep-able when rates are unset.
 * Distinct from recipe residual: rates can be published while settlement stays dark.
 */
export const AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL =
  'DIRECTION §8 ambassador IFC rates are owner-only — refuse-closed (never invent session credits)';

export const AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL =
  'DIRECTION §8 ambassador revenue-share rates are owner-only — refuse-closed (never invent fee %)';

export type AmbassadorRateAuthorityRefuseCode =
  | 'academy.ambassador_pay.rates_unset'
  | 'academy.ambassador_pay.invent_refused'
  | 'academy.ambassador_revenue_share.rates_unset'
  | 'academy.ambassador_revenue_share.invent_refused';

/** True when IFC / share law is unpublished (blank owner authority). */
export function isAmbassadorRateAuthorityUnset(law: AmbassadorIfcPayLaw | AmbassadorRevenueShareLaw): boolean {
  return law.published !== true;
}

export class AmbassadorRateAuthorityRefuseError extends Error {
  constructor(
    message: string,
    readonly code: AmbassadorRateAuthorityRefuseCode,
    readonly residual: string,
  ) {
    super(message);
    this.name = 'AmbassadorRateAuthorityRefuseError';
  }
}

/** Positive decimal string — scaled money shape, not a JS number. */
const DECIMAL_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;

function assertSessionCredit(raw: unknown, path: string): string {
  if (typeof raw !== 'string' || !DECIMAL_RE.test(raw.trim())) {
    throw new AmbassadorRateAuthorityRefuseError(
      `${path} must be a non-negative decimal string`,
      'academy.ambassador_pay.rates_unset',
      AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL,
    );
  }
  const trimmed = raw.trim();
  if (trimmed === '0' || trimmed === '0.0' || /^0\.0+$/.test(trimmed)) {
    throw new AmbassadorRateAuthorityRefuseError(
      `${path} must be > 0 when published (zero is not a pay schedule)`,
      'academy.ambassador_pay.rates_unset',
      AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL,
    );
  }
  return trimmed;
}

function assertNonEmptyString(raw: unknown, path: string, code: AmbassadorRateAuthorityRefuseCode, residual: string): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new AmbassadorRateAuthorityRefuseError(`${path} must be a non-empty string`, code, residual);
  }
  return raw.trim();
}

/**
 * Parse owner-published IFC pay law from env JSON.
 * Empty / whitespace → unpublished. Invalid → throw (fail boot, do not invent).
 *
 * Shape:
 *   { "published": false }
 *   { "published": true, "sessionCredit": "10.00000000", "asset": "IFC", "period": "session" }
 */
export function parseAmbassadorIfcPayLawJson(raw: string | null | undefined): AmbassadorIfcPayLaw {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new AmbassadorRateAuthorityRefuseError(
      'ACADEMY_AMBASSADOR_IFC_PAY_LAW_JSON is not valid JSON',
      'academy.ambassador_pay.rates_unset',
      AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL,
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new AmbassadorRateAuthorityRefuseError(
      'ACADEMY_AMBASSADOR_IFC_PAY_LAW_JSON must be an object',
      'academy.ambassador_pay.rates_unset',
      AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL,
    );
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.published === false) return UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW;
  if (obj.published !== true) {
    throw new AmbassadorRateAuthorityRefuseError(
      'ACADEMY_AMBASSADOR_IFC_PAY_LAW_JSON.published must be true or false',
      'academy.ambassador_pay.rates_unset',
      AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL,
    );
  }

  return {
    published: true,
    sessionCredit: assertSessionCredit(obj.sessionCredit, 'sessionCredit'),
    asset: assertNonEmptyString(obj.asset, 'asset', 'academy.ambassador_pay.rates_unset', AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL),
    period: assertNonEmptyString(obj.period, 'period', 'academy.ambassador_pay.rates_unset', AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL),
  };
}

/**
 * Parse owner-published revenue-share law from env JSON.
 * Empty → unpublished. Invalid → throw (fail boot, do not invent).
 *
 * Shape:
 *   { "published": false }
 *   { "published": true, "shareOfFeeBps": 500, "feeBasis": "lobby_host_fees" }
 */
export function parseAmbassadorRevenueShareLawJson(raw: string | null | undefined): AmbassadorRevenueShareLaw {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new AmbassadorRateAuthorityRefuseError(
      'ACADEMY_AMBASSADOR_REVENUE_SHARE_LAW_JSON is not valid JSON',
      'academy.ambassador_revenue_share.rates_unset',
      AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL,
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new AmbassadorRateAuthorityRefuseError(
      'ACADEMY_AMBASSADOR_REVENUE_SHARE_LAW_JSON must be an object',
      'academy.ambassador_revenue_share.rates_unset',
      AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL,
    );
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.published === false) return UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW;
  if (obj.published !== true) {
    throw new AmbassadorRateAuthorityRefuseError(
      'ACADEMY_AMBASSADOR_REVENUE_SHARE_LAW_JSON.published must be true or false',
      'academy.ambassador_revenue_share.rates_unset',
      AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL,
    );
  }

  const shareOfFeeBps = obj.shareOfFeeBps;
  if (typeof shareOfFeeBps !== 'number' || !Number.isInteger(shareOfFeeBps) || shareOfFeeBps < 0 || shareOfFeeBps > 10_000) {
    throw new AmbassadorRateAuthorityRefuseError(
      'ACADEMY_AMBASSADOR_REVENUE_SHARE_LAW_JSON.shareOfFeeBps must be an integer 0..10000',
      'academy.ambassador_revenue_share.rates_unset',
      AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL,
    );
  }

  return {
    published: true,
    shareOfFeeBps,
    feeBasis: assertNonEmptyString(
      obj.feeBasis,
      'feeBasis',
      'academy.ambassador_revenue_share.rates_unset',
      AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL,
    ),
  };
}

/**
 * Resolve IFC pay law for one attempt.
 * Owner-published env only. Per-call published law is invent — refuse closed.
 */
export function resolveAmbassadorIfcPayLaw(input: {
  readonly requestLaw?: AmbassadorIfcPayLaw | null | undefined;
  readonly law: AmbassadorIfcPayLaw;
}): Extract<AmbassadorIfcPayLaw, { published: true }> {
  if (input.requestLaw?.published === true) {
    throw new AmbassadorRateAuthorityRefuseError(
      'Ambassador IFC pay refuses per-call rate invent — owner-published authority only',
      'academy.ambassador_pay.invent_refused',
      AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL,
    );
  }
  if (input.law.published) {
    return input.law;
  }
  throw new AmbassadorRateAuthorityRefuseError(
    'Ambassador IFC pay is refuse-closed until owner-published rate authority exists',
    'academy.ambassador_pay.rates_unset',
    AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL,
  );
}

export function resolveAmbassadorRevenueShareLaw(input: {
  readonly requestLaw?: AmbassadorRevenueShareLaw | null | undefined;
  readonly law: AmbassadorRevenueShareLaw;
}): Extract<AmbassadorRevenueShareLaw, { published: true }> {
  if (input.requestLaw?.published === true) {
    throw new AmbassadorRateAuthorityRefuseError(
      'Ambassador revenue share refuses per-call rate invent — owner-published authority only',
      'academy.ambassador_revenue_share.invent_refused',
      AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL,
    );
  }
  if (input.law.published) {
    return input.law;
  }
  throw new AmbassadorRateAuthorityRefuseError(
    'Ambassador revenue share is refuse-closed until owner-published rate authority exists',
    'academy.ambassador_revenue_share.rates_unset',
    AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL,
  );
}

export function ambassadorIfcPayLawIsPublished(law: AmbassadorIfcPayLaw): boolean {
  return law.published === true;
}

export function ambassadorRevenueShareLawIsPublished(law: AmbassadorRevenueShareLaw): boolean {
  return law.published === true;
}

/** Ops status — never invents rates into the string. */
export function ambassadorIfcPayLawStatusLine(law: AmbassadorIfcPayLaw): string {
  if (!law.published) return 'published=0';
  return `published=1 period=${law.period} asset=${law.asset}`;
}

export function ambassadorRevenueShareLawStatusLine(law: AmbassadorRevenueShareLaw): string {
  if (!law.published) return 'published=0';
  return `published=1 basis=${law.feeBasis} bps=${law.shareOfFeeBps}`;
}
