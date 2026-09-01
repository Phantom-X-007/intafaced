/**
 * PTX-M08-R10 / R11 — named margin products, refuse-closed.
 *
 * Segregation and calculation are orthogonal. The four combinations are named
 * here so a missing product cannot hide as a UI flag. Isolated (segregated ×
 * standard) is the only live futures IM product. Cash is a named mode, not a
 * silent default on this door. Cross and portfolio are named and refused.
 *
 * This file invents no haircut, IM number, scenario shock, or offset. Portfolio
 * without an owner scenario is OWNER-SET refuse. Yield-bearing / staked /
 * lending-idle collateral is a separate product that does not exist — posting
 * it as IM refuses `unsupported_collateral_class`.
 *
 * Mode is set at open. A live switch with open risk and no migration preview
 * refuses (PTX-M08-R02). `POST /positions/margin-mode` stays 501.
 */

export const NAMED_MARGIN_MODES = ['cash', 'isolated', 'cross', 'portfolio'] as const;
export type NamedMarginMode = (typeof NAMED_MARGIN_MODES)[number];

export const MARGIN_SEGREGATION = ['segregated', 'cross_collateral'] as const;
export type MarginSegregation = (typeof MARGIN_SEGREGATION)[number];

export const MARGIN_CALCULATION = ['standard', 'portfolio'] as const;
export type MarginCalculation = (typeof MARGIN_CALCULATION)[number];

/**
 * Deribit-shaped 2×2: segregated vs cross-collateral × standard vs portfolio.
 * `namedMode` is the API name for that cell (portfolio calculation shares one).
 */
export const MARGIN_PRODUCTS_2X2 = [
  { id: 'segregated_standard', segregation: 'segregated', calculation: 'standard', namedMode: 'isolated' },
  { id: 'segregated_portfolio', segregation: 'segregated', calculation: 'portfolio', namedMode: 'portfolio' },
  { id: 'cross_standard', segregation: 'cross_collateral', calculation: 'standard', namedMode: 'cross' },
  { id: 'cross_portfolio', segregation: 'cross_collateral', calculation: 'portfolio', namedMode: 'portfolio' },
] as const satisfies ReadonlyArray<{
  id: string;
  segregation: MarginSegregation;
  calculation: MarginCalculation;
  namedMode: Exclude<NamedMarginMode, 'cash'>;
}>;

export type MarginProduct2x2 = (typeof MARGIN_PRODUCTS_2X2)[number];

export const COLLATERAL_CLASSES = ['cash', 'yield_bearing', 'staked', 'lending_idle'] as const;
export type CollateralClass = (typeof COLLATERAL_CLASSES)[number];

export const MARGIN_MODE_UNSET = 'trade.margin_mode_unset';
export const MARGIN_MODE_UNKNOWN = 'trade.margin_mode_unknown';
export const CROSS_MARGIN_UNSUPPORTED = 'trade.cross_margin_unsupported';
export const CASH_MARGIN_UNSUPPORTED = 'trade.cash_margin_unsupported';
export const PORTFOLIO_MARGIN_UNSET = 'trade.portfolio_margin_unset';
export const UNSUPPORTED_COLLATERAL_CLASS = 'trade.unsupported_collateral_class';
export const MARGIN_MODE_SWITCH_REQUIRES_PREVIEW = 'trade.margin_mode_switch_requires_preview';
export const MARGIN_MODE_INELIGIBLE = 'trade.margin_mode_ineligible';

export type MarginModeRefuseCode =
  | typeof MARGIN_MODE_UNSET
  | typeof MARGIN_MODE_UNKNOWN
  | typeof CROSS_MARGIN_UNSUPPORTED
  | typeof CASH_MARGIN_UNSUPPORTED
  | typeof PORTFOLIO_MARGIN_UNSET
  | typeof UNSUPPORTED_COLLATERAL_CLASS
  | typeof MARGIN_MODE_SWITCH_REQUIRES_PREVIEW
  | typeof MARGIN_MODE_INELIGIBLE;

export type MarginModeCheck = { readonly ok: true } | { readonly ok: false; readonly code: MarginModeRefuseCode; readonly reason: string };

const NAMED = new Set<string>(NAMED_MARGIN_MODES);
const COLLATERAL = new Set<string>(COLLATERAL_CLASSES);

export function isNamedMarginMode(value: unknown): value is NamedMarginMode {
  return typeof value === 'string' && NAMED.has(value);
}

export function isCollateralClass(value: unknown): value is CollateralClass {
  return typeof value === 'string' && COLLATERAL.has(value);
}

/**
 * OWNER-SET: portfolio scenarios / shocks / floors. This deployment has none.
 * An env blob is not a calculator — never treat presence as enabling IM.
 */
export function ownerPortfolioScenarioSet(_env: NodeJS.ProcessEnv = process.env): boolean {
  return false;
}

/**
 * Parse a caller-supplied mode. Unset and unknown refuse — they are not isolated.
 */
export function parseNamedMarginMode(
  value: unknown,
): { ok: true; mode: NamedMarginMode } | { ok: false; code: MarginModeRefuseCode; reason: string } {
  if (value === undefined || value === null) {
    return {
      ok: false,
      code: MARGIN_MODE_UNSET,
      reason: 'marginMode is unset — name cash, isolated, cross, or portfolio; omitting is not a product',
    };
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return {
      ok: false,
      code: MARGIN_MODE_UNSET,
      reason: 'marginMode is unset — name cash, isolated, cross, or portfolio',
    };
  }
  if (!isNamedMarginMode(value)) {
    return {
      ok: false,
      code: MARGIN_MODE_UNKNOWN,
      reason: `marginMode ${JSON.stringify(value)} is not a named mode — send cash, isolated, cross, or portfolio`,
    };
  }
  return { ok: true, mode: value };
}

function refusePortfolio(): MarginModeCheck {
  return {
    ok: false,
    code: PORTFOLIO_MARGIN_UNSET,
    reason:
      'portfolio margin is a named product and the owner scenario set is unset (OWNER-SET) — refusing to invent shocks, offsets, or IM',
  };
}

function refuseCross(): MarginModeCheck {
  return {
    ok: false,
    code: CROSS_MARGIN_UNSUPPORTED,
    reason:
      'marginMode "cross" is not supported: this platform runs isolated margin only, and there is no cross-margin path ' +
      'to enable. Omit marginMode or send "isolated" — a position opened as isolated when you asked for cross would ' +
      'misreport what is backing it.',
  };
}

function refuseCashOnFutures(): MarginModeCheck {
  return {
    ok: false,
    code: CASH_MARGIN_UNSUPPORTED,
    reason: 'marginMode "cash" is a named spot/settled product, not futures initial margin — send "isolated" or omit it',
  };
}

/**
 * Futures open / live re-leverage door. Isolated (or omitted, meaning isolated)
 * is the only admitted value. Named non-isolated products refuse by name.
 */
export function checkMarginModeForFuturesOpen(value: unknown): MarginModeCheck {
  if (value === undefined || value === 'isolated') return { ok: true };
  const parsed = parseNamedMarginMode(value);
  if (!parsed.ok) return parsed;
  if (parsed.mode === 'isolated') return { ok: true };
  if (parsed.mode === 'cross') return refuseCross();
  if (parsed.mode === 'cash') return refuseCashOnFutures();
  return refusePortfolio();
}

/**
 * Posted IM collateral class. Omitted → cash (settled available quote).
 * Yield-bearing / staked / lending-idle is a separate product that is not set.
 */
export function checkCollateralClassForMargin(value: unknown): MarginModeCheck {
  if (value === undefined) return { ok: true };
  if (value === null || (typeof value === 'string' && value.trim() === '')) {
    return {
      ok: false,
      code: UNSUPPORTED_COLLATERAL_CLASS,
      reason: 'collateralClass is unset — name cash, or a yield/staked/lending-idle class which this product refuses',
    };
  }
  if (!isCollateralClass(value)) {
    return {
      ok: false,
      code: UNSUPPORTED_COLLATERAL_CLASS,
      reason: `collateralClass ${JSON.stringify(value)} is not a named class — send cash, yield_bearing, staked, or lending_idle`,
    };
  }
  if (value === 'cash') return { ok: true };
  return {
    ok: false,
    code: UNSUPPORTED_COLLATERAL_CLASS,
    reason:
      `collateralClass "${value}" is a separate yield/stake/lend product — unsupported here; ` +
      'refusing to post it as initial margin (no owner-set haircut, slash, unbond, or recall)',
  };
}

export interface MarginModeSwitchInput {
  readonly from: unknown;
  readonly to: unknown;
  readonly hasOpenRisk: boolean;
  /** Preview id from an R02 migration preview. Absent → no preview. */
  readonly migrationPreviewId?: string | null;
  /** Eligibility for the destination product. Default false — none is enrolled. */
  readonly eligible?: boolean;
}

/**
 * Live mode change. Isolated-at-open remains the only path; this names why a
 * switch is refused instead of relabelling collateral.
 */
export function checkMarginModeSwitch(input: MarginModeSwitchInput): MarginModeCheck {
  const from = parseNamedMarginMode(input.from);
  if (!from.ok) return from;
  const to = parseNamedMarginMode(input.to);
  if (!to.ok) return to;
  if (from.mode === to.mode) {
    if (to.mode === 'isolated') return { ok: true };
    if (to.mode === 'cross') return refuseCross();
    if (to.mode === 'cash') return refuseCashOnFutures();
    return refusePortfolio();
  }
  if (input.eligible !== true) {
    return {
      ok: false,
      code: MARGIN_MODE_INELIGIBLE,
      reason: `switching ${from.mode} → ${to.mode} is ineligible — no enrolled product or consent for that destination`,
    };
  }
  const preview = typeof input.migrationPreviewId === 'string' ? input.migrationPreviewId.trim() : '';
  if (input.hasOpenRisk && preview === '') {
    return {
      ok: false,
      code: MARGIN_MODE_SWITCH_REQUIRES_PREVIEW,
      reason: 'switching margin mode with open risk requires a migration preview — refusing a silent relabel of collateral',
    };
  }
  if (to.mode === 'isolated') return { ok: true };
  if (to.mode === 'cross') return refuseCross();
  if (to.mode === 'cash') return refuseCashOnFutures();
  return refusePortfolio();
}
