/**
 * v22.alerts MVP types — price watch conditions only.
 *
 * Law §31 / tracker `v22.alerts`: core is condition evaluation against a price
 * the platform can source, plus watchlists. Intelligence tiers, funding, whale
 * flow, and mobile sync are out of scope for this residual.
 *
 * Portfolio is in the tracker TITLE, not in the price core. Until ledger-client
 * publishes a portfolio view, the honest slice is refuse-closed
 * (`alert.portfolio_view_unpublished`) — notify never invents a second book
 * (Doctrine §0.6) and never fires on silence.
 *
 * Money discipline: every price is a decimal *string*. Nothing is a `number`.
 * The portfolio refuse arm carries zero money fields.
 */

/**
 * Price watches are live. Portfolio and the Phase-5 / futures-tied kinds are
 * named so the door can refuse them — never an invented series.
 */
export type UnpublishedAlertKind = 'funding' | 'whale' | 'liquidation_proximity' | 'intelligence';

export const UNPUBLISHED_ALERT_KINDS = [
  'funding',
  'whale',
  'liquidation_proximity',
  'intelligence',
] as const satisfies readonly UnpublishedAlertKind[];

export type AlertKind = 'price' | 'portfolio' | UnpublishedAlertKind;

/** Stable refuse until a ledger portfolio view exists. Never invent a balance. */
export const ALERT_PORTFOLIO_VIEW_UNPUBLISHED = 'alert.portfolio_view_unpublished' as const;

/** Stable refuse for kinds with no sourced series. Never fire, never store. */
export const ALERT_KIND_UNPUBLISHED = 'alert.kind_unpublished' as const;

export class AlertKindUnpublishedError extends Error {
  readonly code: typeof ALERT_KIND_UNPUBLISHED = ALERT_KIND_UNPUBLISHED;
  readonly alertKind: UnpublishedAlertKind;
  constructor(alertKind: UnpublishedAlertKind) {
    super(`${ALERT_KIND_UNPUBLISHED}: ${alertKind} has no sourced series`);
    this.name = 'AlertKindUnpublishedError';
    this.alertKind = alertKind;
  }
}

export function isUnpublishedAlertKind(kind: string | undefined): kind is UnpublishedAlertKind {
  return (UNPUBLISHED_ALERT_KINDS as readonly string[]).includes(kind ?? '');
}

export type CreateUnpublishedAlertInput = {
  readonly kind: UnpublishedAlertKind;
  readonly userId: string;
};

export class AlertPortfolioUnpublishedError extends Error {
  readonly code: typeof ALERT_PORTFOLIO_VIEW_UNPUBLISHED = ALERT_PORTFOLIO_VIEW_UNPUBLISHED;
  constructor(detail = 'ledger portfolio view unpublished — notify holds no balance') {
    super(`${ALERT_PORTFOLIO_VIEW_UNPUBLISHED}: ${detail}`);
    this.name = 'AlertPortfolioUnpublishedError';
  }
}

/**
 * Create a portfolio watch — zero money fields on purpose.
 * Create always throws `AlertPortfolioUnpublishedError`; nothing is stored.
 */
export type CreatePortfolioAlertInput = {
  readonly kind: 'portfolio';
  readonly userId: string;
};

/** Above / below a target. Crossing fires once (status becomes `fired`). */
export type AlertDirection = 'above' | 'below';

export type AlertStatus = 'active' | 'fired' | 'cancelled';

export type PriceAlert = {
  readonly id: string;
  readonly userId: string;
  readonly marketId: string;
  readonly direction: AlertDirection;
  /** Decimal string target. Never a JS number. */
  readonly targetPrice: string;
  readonly status: AlertStatus;
  readonly firedAt: Date | null;
  readonly createdAt: Date;
};

export type CreatePriceAlertInput = {
  readonly userId: string;
  readonly marketId: string;
  readonly direction: AlertDirection;
  readonly targetPrice: string;
};

/**
 * What the platform is willing to say about a market's price right now.
 *
 * `unavailable` is the honesty constraint from the marks work: if we cannot
 * source a price, we refuse the evaluation rather than fire on a stale or
 * invented number (`accepted-mark` vocabulary, transferred to alerts).
 */
export type MarkQuote =
  | { readonly kind: 'ok'; readonly price: string; readonly at: Date }
  | { readonly kind: 'unavailable'; readonly reason: 'dark' | 'stale' | 'refused'; readonly detail?: string };

/**
 * Injected port — svc-notify never reads trade tables (§2).
 *
 * `kind` is CONFIGURATION, not momentary availability, and it is required rather
 * than optional on purpose.
 *
 *   dark   nothing is wired. Every quote is `unavailable`, so no watch this
 *          deployment holds can ever fire, and the user surface has to say so.
 *   live   a real feed is wired. Individual quotes may still come back
 *          `unavailable` (stale, refused) — `live` is a claim about the wiring,
 *          never a promise about the next quote.
 *
 * It is required because the alternative — an optional field defaulting to one of
 * the two — is how a dark source silently claims to be live. A new mark source
 * must state which it is, and the type system asks the question at the only
 * moment anyone can answer it.
 */
export type MarkSource = {
  readonly kind: 'dark' | 'live';
  quote(marketId: string, at?: Date): Promise<MarkQuote>;
};

export type AlertRefuseCode =
  | 'alert.price_unavailable'
  | 'alert.not_active'
  | 'alert.invalid_price'
  | 'alert.portfolio_view_unpublished'
  | 'alert.kind_unpublished'
  | 'channel.not_configured'
  | 'channel.disabled';

export type AlertEvalOutcome =
  | { readonly kind: 'hold'; readonly markPrice: string }
  | { readonly kind: 'fire'; readonly markPrice: string }
  | {
      readonly kind: 'refuse';
      readonly code: AlertRefuseCode;
      readonly detail: string;
    };
