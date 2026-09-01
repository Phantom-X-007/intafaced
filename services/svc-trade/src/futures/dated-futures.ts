/**
 * Dated futures lifecycle honesty (M10 / PTX-M10-R03).
 *
 * Isolated perpetuals already list as kind=futures with no expiry — that
 * remains the perp product. Dated futures are a different product: listing
 * without expiry, or settling without an owner fixing price, must refuse
 * rather than behave as a perp. Style is server-resolved from listing terms,
 * never inferred from symbol text.
 *
 * Owner sockets stay unpublished here: series cadence, disruption fallbacks,
 * delivery vs cash, and roll policy (PX-S07-O03). Empty fixing env is a
 * refusal, not a crash, and never a last-trade / mark substitute.
 */
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { TradeError, type Market } from '../spot/types.js';

export type FuturesContractStyle = 'perpetual' | 'dated';

/** SOCKET pin — dated listing/place without a valid expiry. */
export const DATED_FUTURES_EXPIRY_REQUIRED = 'trade.dated_futures_expiry_required' as const;

/** Half-listed dated terms, or dated terms on a non-futures / perpetual row. */
export const DATED_FUTURES_TERMS_INCOMPLETE = 'trade.dated_futures_terms_incomplete' as const;

/** TRADE_FUTURES_SETTLEMENT_FIXING empty on a dated product. */
export const DATED_FUTURES_FIXING_UNCONFIGURED = 'trade.dated_futures_fixing_unconfigured' as const;

/** Expiry job: owner settlement/fixing price blank — never last trade / mark. */
export const DATED_FUTURES_SETTLEMENT_PRICE_UNSET = 'trade.dated_futures_settlement_price_unset' as const;

/** Place/open after listed expiry — contract is no longer a live perp. */
export const DATED_FUTURES_EXPIRED = 'trade.dated_futures_expired' as const;

/** Opaque paper-drill fixing stamp — not a settlement price, not a live oracle. */
export const DATED_FUTURES_PAPER_FIXING_STAMP = 'paper' as const;

export interface DatedFuturesListingTerms {
  readonly style: FuturesContractStyle;
  readonly expiryAt: Date | null;
  /** Opaque operator string — not parsed for source/window/price. */
  readonly settlementFixing: string | null;
}

export interface ResolveDatedFuturesListingInput {
  readonly kind: Market['kind'];
  /**
   * Explicit constitution style. Omitted on kind=futures → perpetual.
   * Never derived from the symbol.
   */
  readonly futuresContractStyle?: FuturesContractStyle | null;
  readonly expiryAt?: Date | null;
  /**
   * Deployment config for dated settlement fixing (`TRADE_FUTURES_SETTLEMENT_FIXING`).
   * Empty / whitespace = not configured. Presence only — never parsed.
   */
  readonly settlementFixingConfigured: string;
  /**
   * Paper drills: dated listing is allowed without inventing live fixing law.
   * Live (`false` / omitted) still refuses when the env stamp is empty.
   */
  readonly paper?: boolean;
}

function hasValidExpiry(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Resolve dated/perpetual listing terms, or null for non-futures.
 *
 * Throws `trade.dated_futures_expiry_required` when style is dated and expiry
 * is missing. Throws `trade.dated_futures_fixing_unconfigured` when live dated
 * listing has empty TRADE_FUTURES_SETTLEMENT_FIXING. Throws
 * `trade.dated_futures_terms_incomplete` for half-shaped rows (expiry on a
 * perp, dated terms on spot/options).
 */
export function resolveDatedFuturesListing(input: ResolveDatedFuturesListingInput): DatedFuturesListingTerms | null {
  const hasExpiry = hasValidExpiry(input.expiryAt);
  const styleIn = input.futuresContractStyle ?? null;
  const hasDatedHint = styleIn === 'dated' || hasExpiry;

  if (input.kind !== 'futures') {
    if (hasDatedHint) {
      throw new TradeError(
        'dated futures terms are only valid when kind is futures — refuse half-shaped listings',
        DATED_FUTURES_TERMS_INCOMPLETE,
      );
    }
    return null;
  }

  if (styleIn != null && styleIn !== 'perpetual' && styleIn !== 'dated') {
    throw new TradeError(
      'futures listing requires futuresContractStyle perpetual|dated — half-listed dated futures are refused',
      DATED_FUTURES_TERMS_INCOMPLETE,
    );
  }

  const style: FuturesContractStyle = styleIn === 'dated' ? 'dated' : 'perpetual';

  if (style === 'perpetual') {
    if (hasExpiry) {
      throw new TradeError(
        'perpetual futures cannot carry an expiry — dated products must set futuresContractStyle=dated; refuse half-shaped listings',
        DATED_FUTURES_TERMS_INCOMPLETE,
      );
    }
    return { style: 'perpetual', expiryAt: null, settlementFixing: null };
  }

  const paper = input.paper === true;
  const fixing = paper
    ? input.settlementFixingConfigured.trim() || DATED_FUTURES_PAPER_FIXING_STAMP
    : input.settlementFixingConfigured.trim();
  if (fixing.length === 0) {
    throw new TradeError(
      'dated futures cannot be listed until settlement fixing is configured (TRADE_FUTURES_SETTLEMENT_FIXING empty) — PX-S07-O03 is owner law; empty means refuse, never invent last trade as settlement',
      DATED_FUTURES_FIXING_UNCONFIGURED,
    );
  }

  if (!hasExpiry) {
    throw new TradeError(
      'dated futures listing requires a valid expiryAt — a contract without expiry must not behave as a perp',
      DATED_FUTURES_EXPIRY_REQUIRED,
    );
  }

  return { style: 'dated', expiryAt: input.expiryAt, settlementFixing: fixing };
}

export function datedFuturesStyleOf(market: Pick<Market, 'kind' | 'futuresContractStyle'>): FuturesContractStyle | null {
  if (market.kind !== 'futures') return null;
  return market.futuresContractStyle === 'dated' ? 'dated' : 'perpetual';
}

/** Dated contracts do not accrue perpetual funding. Perps do. */
export function datedFuturesAccruesFunding(style: FuturesContractStyle | null): boolean {
  return style === 'perpetual';
}

/**
 * Place/open gate: dated without expiry or owner fixing refuses; after expiry
 * refuses. Perpetuals pass through (perp remains perp). Clock is optional so
 * `assertTradable` can stay clock-free when `now` is omitted — structural
 * refusals still fire.
 */
export function assertDatedFuturesTradable(
  market: Pick<Market, 'kind' | 'symbol' | 'futuresContractStyle' | 'futuresExpiryAt' | 'futuresSettlementFixing'>,
  options: { readonly now?: Date } = {},
): void {
  const style = datedFuturesStyleOf(market);
  if (style !== 'dated') return;

  if (!hasValidExpiry(market.futuresExpiryAt ?? null)) {
    throw new TradeError(
      `${market.symbol} is a dated futures market without expiry — refuse rather than trade it as a perp`,
      DATED_FUTURES_EXPIRY_REQUIRED,
    );
  }
  const fixing = (market.futuresSettlementFixing ?? '').trim();
  if (fixing.length === 0) {
    throw new TradeError(
      `${market.symbol} is a dated futures market and settlement fixing is unpublished (TRADE_FUTURES_SETTLEMENT_FIXING empty) — refuse rather than invent last trade as settlement`,
      DATED_FUTURES_FIXING_UNCONFIGURED,
    );
  }
  const now = options.now;
  if (now != null && now.getTime() >= market.futuresExpiryAt!.getTime()) {
    throw new TradeError(
      `${market.symbol} dated futures expiry ${market.futuresExpiryAt!.toISOString()} has passed — not a perpetual`,
      DATED_FUTURES_EXPIRED,
    );
  }
}

export type DatedFuturesSettlementResult =
  | { readonly status: 'skipped'; readonly reason: 'not_dated' | 'not_expired' }
  | { readonly status: 'refused'; readonly reason: 'settlement_price_unset'; readonly code: typeof DATED_FUTURES_SETTLEMENT_PRICE_UNSET }
  | { readonly status: 'ready'; readonly settlementPrice: string; readonly source: 'owner_fixing' };

/**
 * Expiry settlement: owner-published fixing price as a decimal string, or refuse.
 *
 * `lastTradePrice` / `markPrice` are accepted only so callers (and tests) can
 * prove they are ignored. They are never read as a fallback. Missing/invalid
 * owner price → `trade.dated_futures_settlement_price_unset`.
 */
export function resolveDatedFuturesSettlement(input: {
  readonly style: FuturesContractStyle | null;
  readonly expiryAt: Date | null;
  readonly now: Date;
  /** Owner-published settlement/fixing price (decimal string). Empty refuses. */
  readonly ownerSettlementPrice: string | null | undefined;
  /** MUST NOT be used. Present so tests can prove last-trade is not settlement. */
  readonly lastTradePrice?: string | null;
  /** MUST NOT be used. Present so tests can prove mark is not settlement. */
  readonly markPrice?: string | null;
}): DatedFuturesSettlementResult {
  void input.lastTradePrice;
  void input.markPrice;
  if (input.style !== 'dated') {
    return { status: 'skipped', reason: 'not_dated' };
  }
  if (!hasValidExpiry(input.expiryAt) || input.now.getTime() < input.expiryAt.getTime()) {
    return { status: 'skipped', reason: 'not_expired' };
  }
  const raw = (input.ownerSettlementPrice ?? '').trim();
  if (raw.length === 0) {
    return { status: 'refused', reason: 'settlement_price_unset', code: DATED_FUTURES_SETTLEMENT_PRICE_UNSET };
  }
  let price: Amount;
  try {
    price = parseAmount(raw);
  } catch {
    return { status: 'refused', reason: 'settlement_price_unset', code: DATED_FUTURES_SETTLEMENT_PRICE_UNSET };
  }
  if (price <= 0n) {
    return { status: 'refused', reason: 'settlement_price_unset', code: DATED_FUTURES_SETTLEMENT_PRICE_UNSET };
  }
  return { status: 'ready', settlementPrice: formatAmount(price), source: 'owner_fixing' };
}

/**
 * One-contract expiry job. Does not post. Does not invent a settlement price
 * from last trade, mark, or depth. Owner source blank → refused.
 */
export function runDatedFuturesExpiryTick(input: {
  readonly style: FuturesContractStyle | null;
  readonly expiryAt: Date | null;
  readonly now: Date;
  readonly ownerSettlementPrice: string | null | undefined;
  readonly lastTradePrice?: string | null;
  readonly markPrice?: string | null;
}): DatedFuturesSettlementResult {
  return resolveDatedFuturesSettlement(input);
}
