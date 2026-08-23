/**
 * Live placeIocMarketBuy: public orderbook then POST /api/v1/orders IOC.
 *
 * Empty asks → filledQty 0 (job maps to token.buyback_book_empty). A non-empty
 * book MUST call placeOrder — sizing from depth without posting would invent
 * a fill. Filled qty is the order's `filled` decimal string, never the sized
 * intent. Unset symbol / unreachable trade / 401 is token.buyback_job_unset.
 */
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { sizeIocBuyFromAsks } from './economics/buyback.js';
import { TokenError } from './token-service.js';
import type { BuybackPlaceFill } from './buyback-job.js';

export interface TradeIocMarketBuyOpts {
  readonly tradeUrl: string;
  readonly symbol: string;
  readonly internalSecret: string;
}

export function createTradeIocMarketBuy(
  opts: TradeIocMarketBuyOpts,
): (input: { quoteBudget: Amount; clientOrderId: string }) => Promise<BuybackPlaceFill> {
  const url = opts.tradeUrl.replace(/\/$/, '');
  const symbol = opts.symbol.trim();

  return async ({ quoteBudget, clientOrderId }) => {
    if (!symbol) {
      throw new TokenError('BUYBACK_SYMBOL is unset — refusing to invent a listing', 'token.buyback_job_unset');
    }

    const bookUrl = `${url}/api/v1/orderbook/${encodeURIComponent(symbol)}`;
    let bookRes: Response;
    try {
      bookRes = await fetch(bookUrl);
    } catch (err) {
      throw new TokenError(`svc-trade orderbook unreachable: ${(err as Error).message}`, 'token.buyback_job_unset');
    }
    if (!bookRes.ok) {
      throw new TokenError(`svc-trade orderbook failed (${bookRes.status})`, 'token.buyback_job_unset');
    }

    const body = (await bookRes.json()) as { asks?: unknown };
    const asksRaw = Array.isArray(body.asks) ? body.asks : [];
    const asks: Array<{ price: Amount; qty: Amount }> = [];
    for (const row of asksRaw) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || typeof row[1] !== 'string') continue;
      try {
        const price = parseAmount(row[0]);
        const qty = parseAmount(row[1]);
        if (price > 0n && qty > 0n) asks.push({ price, qty });
      } catch {
        // Skip a malformed level rather than invent a price.
      }
    }

    const qty = sizeIocBuyFromAsks(asks, quoteBudget);
    if (qty <= 0n) return { filledQty: 0n };

    const orderBody = JSON.stringify({
      symbol,
      type: 'market',
      side: 'buy',
      amount: formatAmount(qty),
      timeInForce: 'IOC',
      clientOrderId,
    });
    const placeUrl = `${url}/api/v1/orders`;
    let placeRes: Response;
    try {
      placeRes = await fetch(placeUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-token', opts.internalSecret, orderBody) },
        body: orderBody,
      });
    } catch (err) {
      throw new TokenError(`svc-trade placeOrder unreachable: ${(err as Error).message}`, 'token.buyback_job_unset');
    }
    if (!placeRes.ok) {
      throw new TokenError(`IOC market-buy refused (${placeRes.status})`, 'token.buyback_job_unset');
    }
    const order = (await placeRes.json()) as { filled?: unknown };
    if (typeof order.filled !== 'string') {
      throw new TokenError('placeOrder response missing decimal filled — refusing to invent a fill', 'token.buyback_book_empty');
    }
    let filledQty: Amount;
    try {
      filledQty = parseAmount(order.filled);
    } catch {
      throw new TokenError('placeOrder filled is not a decimal string', 'token.buyback_book_empty');
    }
    if (filledQty < 0n) {
      throw new TokenError('placeOrder filled was negative — refusing', 'token.buyback_book_empty');
    }
    return { filledQty };
  };
}
