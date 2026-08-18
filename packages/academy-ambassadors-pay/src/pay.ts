/**
 * Ambassador IFC pay / fee-share — Class M refuse-closed until owner rates
 * (TRK-academy.ambassadors).
 *
 * Appoint/freeze + residency stay in svc-academy. This module only gates money.
 * It does not invent bps, IFC amounts, or P&L profit-share.
 *
 * Owner rate: env `ACADEMY_AMBASSADOR_SHARE_BPS` (no default). Unset →
 * `academy.ambassador_rate_unset`. Rate set with no ambassador-named ledger
 * export on tip → `academy.ambassador_recipe_unwired` (still no post).
 */

export const ACADEMY_AMBASSADOR_SHARE_BPS_ENV = 'ACADEMY_AMBASSADOR_SHARE_BPS';

export type AmbassadorPayKind = 'ifc_pay' | 'fee_share' | 'pnl_profit_share';

export type AmbassadorPayRefuseCode =
  'academy.ambassador_rate_unset' | 'academy.ambassador_recipe_unwired' | 'academy.ambassador_pnl_share_banned';

/** Names we would accept as ambassador pay on the ledger export surface. None exist on tip. */
export const AMBASSADOR_PAY_EXPORT_NAMES = ['ambassadorFeeShare', 'ambassadorIfcPay'] as const;

/**
 * Ledger export names that would count as ambassador pay if present.
 * Tip has none of these — do not alias feeCharge / rewardPay (those are not ambassador pay).
 */
export function findNamedAmbassadorPayExport(catalog: readonly string[]): string | undefined {
  return catalog.find((name) => (AMBASSADOR_PAY_EXPORT_NAMES as readonly string[]).includes(name));
}

export type EnvBag = { readonly [key: string]: string | undefined };

export type OwnerShareBps = { readonly present: false } | { readonly present: true; readonly bps: number };

/**
 * Read owner fee-share bps. Missing / blank is unset — never coerced to 0
 * (0-as-free would be invented). Explicit `0` is owner-present, not a skip.
 */
export function readOwnerShareBps(env: EnvBag = process.env): OwnerShareBps {
  const raw = env[ACADEMY_AMBASSADOR_SHARE_BPS_ENV];
  if (raw === undefined) return { present: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { present: false };
  if (!/^[0-9]+$/.test(trimmed)) return { present: false };
  const bps = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(bps) || bps < 0 || bps > 9_999) return { present: false };
  return { present: true, bps };
}

export type LedgerPostPort = {
  post: (body: unknown) => unknown | Promise<unknown>;
};

export type AmbassadorPayInput = {
  readonly kind: AmbassadorPayKind;
  readonly ambassadorUserId: string;
};

export type AmbassadorPayRefuse = {
  readonly ok: false;
  readonly code: AmbassadorPayRefuseCode;
  readonly kind: AmbassadorPayKind;
  readonly ledgerPosted: false;
  readonly ownerShareBps: number | null;
  readonly settlement: 'unwired' | 'refused';
  readonly residual: string;
};

const RATE_UNSET_RESIDUAL =
  'TRK-academy.ambassadors Class M — ACADEMY_AMBASSADOR_SHARE_BPS unset; refuse-closed (no invent bps, no 0-as-free)';

const RECIPE_UNWIRED_RESIDUAL =
  'TRK-academy.ambassadors Class M — owner bps set; no ambassador-named ledger export; settlement unwired (no invent mapping)';

const PNL_BANNED_RESIDUAL = 'TRK-academy.ambassadors Class M — P&L profit-share banned; fee-share/bps from owner env only';

function refuse(
  kind: AmbassadorPayKind,
  code: AmbassadorPayRefuseCode,
  residual: string,
  ownerShareBps: number | null,
): AmbassadorPayRefuse {
  return {
    ok: false,
    code,
    kind,
    ledgerPosted: false,
    ownerShareBps,
    settlement: code === 'academy.ambassador_recipe_unwired' ? 'unwired' : 'refused',
    residual,
  };
}

/**
 * Shared gate for propose + payout. Never posts. Never invents a fee base or IFC amount.
 */
export function decideAmbassadorPay(
  input: AmbassadorPayInput,
  opts: { readonly env?: EnvBag; readonly ledgerExportCatalog?: readonly string[] } = {},
): AmbassadorPayRefuse {
  if (input.kind === 'pnl_profit_share') {
    return refuse(input.kind, 'academy.ambassador_pnl_share_banned', PNL_BANNED_RESIDUAL, null);
  }

  const owner = readOwnerShareBps(opts.env ?? process.env);
  if (!owner.present) {
    return refuse(input.kind, 'academy.ambassador_rate_unset', RATE_UNSET_RESIDUAL, null);
  }

  const named = findNamedAmbassadorPayExport(opts.ledgerExportCatalog ?? []);
  if (named === undefined) {
    return refuse(input.kind, 'academy.ambassador_recipe_unwired', RECIPE_UNWIRED_RESIDUAL, owner.bps);
  }

  // A named export in the catalog still does not mint a posting here: wiring
  // a real PostRequest is a later Class M change, not this refuse slice.
  return refuse(input.kind, 'academy.ambassador_recipe_unwired', RECIPE_UNWIRED_RESIDUAL, owner.bps);
}

export function proposePay(
  input: AmbassadorPayInput,
  opts: {
    readonly env?: EnvBag;
    readonly ledger?: LedgerPostPort;
    readonly ledgerExportCatalog?: readonly string[];
  } = {},
): AmbassadorPayRefuse {
  const decision = decideAmbassadorPay(input, opts);
  void opts.ledger;
  return decision;
}

export async function payout(
  input: AmbassadorPayInput,
  opts: {
    readonly env?: EnvBag;
    readonly ledger?: LedgerPostPort;
    readonly ledgerExportCatalog?: readonly string[];
  } = {},
): Promise<AmbassadorPayRefuse> {
  const decision = decideAmbassadorPay(input, opts);
  void opts.ledger;
  return decision;
}
