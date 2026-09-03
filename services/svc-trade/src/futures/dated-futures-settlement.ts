/**
 * Dated futures settlement job (CARD F3 / PTX-M10-R03, JobHost H6).
 *
 * Hitch: existing `runDatedFuturesExpiryTick` (owner decimal fixing only) +
 * existing `planClose` recipes — `futuresRealizeProfit`, `futuresRealizeLoss`,
 * `futuresMarginRelease`. Does not invent a fixing. Does not recut router.ts,
 * trade-service.ts, types.ts, or ccxt-errors.ts. JobHost wiring lives in
 * `futures-jobs.ts` (`futures.dated_settlement`).
 *
 * Given a dated market past expiry and an owner decimal fixing string, posts
 * balanced ledger-client recipes. Blank TRADE_FUTURES_SETTLEMENT_FIXING or
 * blank/invalid owner decimal → `trade.dated_futures_settlement_price_unset`
 * and zero posts. lastTrade / mark are accepted only so tests can prove they
 * are ignored. Never last trade as fixing. Never invent a default for
 * TRADE_FUTURES_SETTLEMENT_FIXING.
 *
 * Idempotent on settlement id (`dated-settle:${positionId}`).
 */
import type { LedgerClient, PostRequest } from '@intafaced/ledger-client';
import { planClose, type ClosePosition } from './close-planner.js';
import {
  DATED_FUTURES_SETTLEMENT_PRICE_UNSET,
  runDatedFuturesExpiryTick,
  type DatedFuturesSettlementResult,
  type FuturesContractStyle,
} from './dated-futures.js';

export { DATED_FUTURES_SETTLEMENT_PRICE_UNSET };

/** Stable settlement id — one close per position, never per attempt. */
export function datedSettlementIdFor(positionId: string): string {
  return `dated-settle:${positionId}`;
}

export type DatedFuturesSettlementPosition = ClosePosition;

export type DatedFuturesSettlementJobResult =
  | (DatedFuturesSettlementResult & { readonly posts: readonly PostRequest[] })
  | {
      readonly status: 'settled';
      readonly settlementPrice: string;
      readonly source: 'owner_fixing';
      readonly posts: readonly PostRequest[];
      readonly settlementIds: readonly string[];
      readonly settledPositionIds: readonly string[];
    };

export interface DatedSettlementMarket {
  readonly marketId: string;
  readonly style: FuturesContractStyle | null;
  readonly expiryAt: Date | null;
}

export interface DatedSettlementMarkets {
  listExpiredDated(now: Date): Promise<readonly DatedSettlementMarket[]>;
}

export interface DatedSettlementPositions {
  listOpenForMarket(marketId: string): Promise<readonly DatedFuturesSettlementPosition[]>;
}

export async function runDatedFuturesSettlementJob(input: {
  readonly style: FuturesContractStyle | null;
  readonly expiryAt: Date | null;
  readonly now: Date;
  /** Owner-published settlement/fixing price (decimal string). Empty refuses. */
  readonly ownerSettlementPrice: string | null | undefined;
  /** MUST NOT be used. Present so tests can prove last-trade is not settlement. */
  readonly lastTradePrice?: string | null;
  /** MUST NOT be used. Present so tests can prove mark is not settlement. */
  readonly markPrice?: string | null;
  readonly positions: readonly DatedFuturesSettlementPosition[];
  readonly ledger: Pick<LedgerClient, 'post'>;
}): Promise<DatedFuturesSettlementJobResult> {
  void input.lastTradePrice;
  void input.markPrice;
  const resolved = runDatedFuturesExpiryTick({
    style: input.style,
    expiryAt: input.expiryAt,
    now: input.now,
    ownerSettlementPrice: input.ownerSettlementPrice,
    lastTradePrice: input.lastTradePrice,
    markPrice: input.markPrice,
  });
  if (resolved.status !== 'ready') {
    return { ...resolved, posts: [] };
  }

  const posts: PostRequest[] = [];
  const settlementIds: string[] = [];
  for (const position of input.positions) {
    const settlementId = datedSettlementIdFor(position.positionId);
    const plan = planClose({
      closeId: settlementId,
      position,
      exitPrice: resolved.settlementPrice,
    });
    if (!plan.close) continue;
    for (const req of plan.recipes) {
      await input.ledger.post(req);
      posts.push(req);
    }
    settlementIds.push(settlementId);
  }

  return {
    status: 'settled',
    settlementPrice: resolved.settlementPrice,
    source: 'owner_fixing',
    posts,
    settlementIds,
    settledPositionIds: settlementIds.map((id) => id.slice('dated-settle:'.length)),
  };
}

async function resolveOwnerDecimal(
  source: ((marketId: string) => string | null | undefined | Promise<string | null | undefined>) | undefined,
  marketId: string,
): Promise<string> {
  if (source == null) return '';
  const raw = await source(marketId);
  return (raw ?? '').trim();
}

/**
 * Scan expired dated markets and run the mill per market.
 *
 * Blank `settlementFixingConfigured` (TRADE_FUTURES_SETTLEMENT_FIXING) forces
 * an empty owner price — the mill refuses, last trade / mark are never read.
 * Production omits `ownerSettlementPriceFor`; tests inject a decimal string.
 */
export async function runDatedFuturesSettlementScan(input: {
  readonly now: Date;
  readonly settlementFixingConfigured: string | null | undefined;
  readonly ownerSettlementPriceFor?: (marketId: string) => string | null | undefined | Promise<string | null | undefined>;
  readonly lastTradePrice?: string | null;
  readonly markPrice?: string | null;
  readonly markets: DatedSettlementMarkets;
  readonly positions: DatedSettlementPositions;
  readonly ledger: Pick<LedgerClient, 'post'>;
  readonly markClosed?: (positionId: string) => Promise<void>;
}): Promise<readonly DatedFuturesSettlementJobResult[]> {
  void input.lastTradePrice;
  void input.markPrice;
  const fixing = (input.settlementFixingConfigured ?? '').trim();
  const markets = await input.markets.listExpiredDated(input.now);
  const results: DatedFuturesSettlementJobResult[] = [];
  for (const market of markets) {
    const ownerSettlementPrice = fixing.length === 0 ? '' : await resolveOwnerDecimal(input.ownerSettlementPriceFor, market.marketId);
    const positions = await input.positions.listOpenForMarket(market.marketId);
    const result = await runDatedFuturesSettlementJob({
      style: market.style,
      expiryAt: market.expiryAt,
      now: input.now,
      ownerSettlementPrice,
      lastTradePrice: input.lastTradePrice,
      markPrice: input.markPrice,
      positions,
      ledger: input.ledger,
    });
    if (result.status === 'settled' && input.markClosed) {
      for (const positionId of result.settledPositionIds) {
        await input.markClosed(positionId);
      }
    }
    results.push(result);
  }
  return results;
}
