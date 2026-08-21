/**
 * Live trade public REST samples for navigator Stage-2 data tools.
 *
 * Production leave unset: live `trade.quote` / `trade.markets.list` on a dark
 * plane or without fixtures refuse honestly — never invented mids or listings.
 */

import type { MarketListFixture, QuoteFixture } from './data-tools.js';

export type NavigatorTradeDataPort = {
  listMarkets(): Promise<readonly MarketListFixture[]>;
  quote(marketId: string): Promise<QuoteFixture | null>;
};

export type LiveNavigatorMarkets =
  { readonly ok: true; readonly markets: readonly MarketListFixture[] } | { readonly ok: false; readonly reason: 'no_live_markets' };

export type LiveNavigatorQuote =
  { readonly ok: true; readonly quote: QuoteFixture } | { readonly ok: false; readonly reason: 'no_live_quote' };

export async function readLiveNavigatorMarkets(port: NavigatorTradeDataPort | undefined): Promise<LiveNavigatorMarkets> {
  if (port === undefined) {
    return { ok: false, reason: 'no_live_markets' };
  }
  try {
    const markets = await port.listMarkets();
    if (!Array.isArray(markets) || markets.length === 0) {
      return { ok: false, reason: 'no_live_markets' };
    }
    return { ok: true, markets };
  } catch {
    return { ok: false, reason: 'no_live_markets' };
  }
}

export async function readLiveNavigatorQuote(port: NavigatorTradeDataPort | undefined, marketId: string): Promise<LiveNavigatorQuote> {
  if (port === undefined || !marketId.trim()) {
    return { ok: false, reason: 'no_live_quote' };
  }
  try {
    const quote = await port.quote(marketId);
    if (quote === null || !quote.marketId.trim() || quote.last === null) {
      return { ok: false, reason: 'no_live_quote' };
    }
    return { ok: true, quote };
  } catch {
    return { ok: false, reason: 'no_live_quote' };
  }
}
