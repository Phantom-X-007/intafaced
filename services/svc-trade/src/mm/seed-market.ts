/**
 * Market-maker seeder (trade.mm-bot residual).
 *
 * Orchestrates: external mid → planSeedQuotes → ledger marketMakerOrderHold →
 * matching submit (post-only GTC limits) under house MM identity.
 *
 * Cancel/reseed: cancelSeedMarket cancels known seed order ids for a prior run
 * and releases remaining MM holds (balance-read, never invent amount). A new
 * seed cycle MUST use a new runId — hold keys are idempotent per order id.
 *
 * Does NOT invent mid, market list, or inventory. Fund the pot first via
 * marketMakerSeedFund. Seed uses post-only so orders rest or reject, never take.
 * House maker fill: recipes.marketMakerMakerFill + settleFill branch when
 * makerAccountId is house:market-maker (no trade.orders row required).
 *
 * Default: call site / ops enables. This module is pure orchestration with
 * injected ports — no wall-clock job here.
 */
import {
  formatAmount,
  marketMakerOrderHoldAccount,
  mul,
  parseAmount,
  recipes,
  type Amount,
  type LedgerClient,
} from '@intafaced/ledger-client';
import type { EngineSubmitResult, MatchingClient } from '../spot/matching-client.js';
import { mmSeedOrderIdFor } from '../spot/ids.js';
import { planSeedQuotes, type SeedLevelIntent, type SeedPlanInput } from './seed-planner.js';

/** Matching STP account for house market-maker — distinct from user ids. */
export const MM_MATCHING_ACCOUNT_ID = 'house:market-maker';

export function isHouseMmAccount(accountId: string): boolean {
  return accountId === MM_MATCHING_ACCOUNT_ID;
}

export interface SeedMarketSpec extends SeedPlanInput {
  marketId: string;
  baseAsset: string;
  quoteAsset: string;
  /**
   * Stable id for this seed run — used in order ids + hold keys so retries
   * are idempotent. Never random per intent without a run id.
   */
  runId: string;
}

export interface SeedMarketDeps {
  ledger: Pick<LedgerClient, 'post'>;
  matching: Pick<MatchingClient, 'submit'>;
  /** Override order id generation (tests). */
  orderIdFor?: (intent: SeedLevelIntent, index: number) => string;
}

export type SeedPlacementStatus = 'resting' | 'rejected' | 'hold_failed' | 'submit_indeterminate' | 'released_after_reject';

export interface SeedPlacement {
  orderId: string;
  intent: SeedLevelIntent;
  holdAsset: string;
  holdAmount: string;
  status: SeedPlacementStatus;
  rejectCode?: string;
  rejectMessage?: string;
}

export type SeedMarketResult =
  { ok: false; reason: string; placements: SeedPlacement[] } | { ok: true; mid: string; placements: SeedPlacement[] };

function holdForSeed(
  side: 'buy' | 'sell',
  price: Amount,
  qty: Amount,
  baseAsset: string,
  quoteAsset: string,
): { assetId: string; amount: Amount } {
  // Quote for buys (ceil notional), base for sells — same rule as holdFor.
  return side === 'buy' ? { assetId: quoteAsset, amount: mul(price, qty, 'ceil') } : { assetId: baseAsset, amount: qty };
}

function defaultOrderId(runId: string, marketId: string, intent: SeedLevelIntent): string {
  // Deterministic UUID: fills table + hold keys need uuid shape.
  return mmSeedOrderIdFor(runId, marketId, intent.side, intent.level);
}

/**
 * Seed one market's book from an external mid.
 * Empty mid / bad params → ok:false, no posts.
 */
export async function seedMarket(spec: SeedMarketSpec, deps: SeedMarketDeps): Promise<SeedMarketResult> {
  const plan = planSeedQuotes({
    midPrice: spec.midPrice,
    halfSpreadBps: spec.halfSpreadBps,
    stepBps: spec.stepBps,
    levels: spec.levels,
    qtyPerLevel: spec.qtyPerLevel,
  });

  if (!plan.ok) {
    return { ok: false, reason: plan.reason, placements: [] };
  }

  if (!spec.marketId.trim() || !spec.baseAsset.trim() || !spec.quoteAsset.trim()) {
    return { ok: false, reason: 'invalid_market', placements: [] };
  }
  if (!spec.runId.trim()) {
    return { ok: false, reason: 'missing_run_id', placements: [] };
  }

  const placements: SeedPlacement[] = [];

  for (let i = 0; i < plan.intents.length; i++) {
    const intent = plan.intents[i]!;
    const orderId = deps.orderIdFor?.(intent, i) ?? defaultOrderId(spec.runId, spec.marketId, intent);
    const price = parseAmount(intent.price);
    const qty = parseAmount(intent.qty);
    const hold = holdForSeed(intent.side, price, qty, spec.baseAsset, spec.quoteAsset);

    try {
      await deps.ledger.post(
        recipes.marketMakerOrderHold({
          orderId,
          assetId: hold.assetId,
          amount: hold.amount,
        }),
      );
    } catch {
      placements.push({
        orderId,
        intent,
        holdAsset: hold.assetId,
        holdAmount: formatAmount(hold.amount),
        status: 'hold_failed',
      });
      continue;
    }

    let result: EngineSubmitResult;
    try {
      result = await deps.matching.submit(spec.marketId, {
        orderId,
        accountId: MM_MATCHING_ACCOUNT_ID,
        type: 'limit',
        side: intent.side,
        qty: intent.qty,
        price: intent.price,
        tif: 'PO', // post-only: rest or reject — never take (house fill residual)
      });
    } catch {
      // Indeterminate: engine may hold the order. Keep MM hold; cancel path later.
      placements.push({
        orderId,
        intent,
        holdAsset: hold.assetId,
        holdAmount: formatAmount(hold.amount),
        status: 'submit_indeterminate',
      });
      continue;
    }

    if (!result.accepted || result.rejected) {
      try {
        await deps.ledger.post(
          recipes.marketMakerOrderHoldRelease({
            orderId,
            assetId: hold.assetId,
            amount: hold.amount,
          }),
        );
        placements.push({
          orderId,
          intent,
          holdAsset: hold.assetId,
          holdAmount: formatAmount(hold.amount),
          status: 'released_after_reject',
          rejectCode: result.rejected?.code,
          rejectMessage: result.rejected?.message,
        });
      } catch {
        placements.push({
          orderId,
          intent,
          holdAsset: hold.assetId,
          holdAmount: formatAmount(hold.amount),
          status: 'rejected',
          rejectCode: result.rejected?.code,
          rejectMessage: result.rejected?.message,
        });
      }
      continue;
    }

    placements.push({
      orderId,
      intent,
      holdAsset: hold.assetId,
      holdAmount: formatAmount(hold.amount),
      status: result.resting ? 'resting' : 'rejected',
      rejectCode: result.resting ? undefined : 'no_resting',
    });
  }

  const anyResting = placements.some((p) => p.status === 'resting');
  if (!anyResting) {
    return { ok: false, reason: 'no_resting_orders', placements };
  }

  return { ok: true, mid: formatAmount(plan.mid), placements };
}

export function summarizeSeedMarket(result: SeedMarketResult): string {
  if (!result.ok) {
    return `seed skip (${result.reason}) placements=${result.placements.length}`;
  }
  const resting = result.placements.filter((p) => p.status === 'resting').length;
  return `seed ok mid=${result.mid} resting=${resting}/${result.placements.length}`;
}

// ── Cancel / reseed lifecycle ────────────────────────────────────────────────

export interface CancelSeedSpec {
  marketId: string;
  baseAsset: string;
  quoteAsset: string;
  /** Levels used in the prior seed run (defines order-id set). */
  levels: number;
  /** Prior run id — same ids seedMarket used. */
  runId: string;
}

export interface CancelSeedDeps {
  ledger: Pick<LedgerClient, 'post' | 'balance'>;
  matching: Pick<MatchingClient, 'cancel'>;
  /** Override order id generation (tests) — must match seed. */
  orderIdFor?: (side: 'buy' | 'sell', level: number) => string;
}

export type CancelSeedPlacementStatus =
  'cancelled_and_released' | 'not_live_released' | 'not_live_no_hold' | 'cancelled_no_hold' | 'cancel_indeterminate' | 'release_failed';

export interface CancelSeedPlacement {
  orderId: string;
  side: 'buy' | 'sell';
  level: number;
  status: CancelSeedPlacementStatus;
  /** Engine cancelled live order; null if cancel call threw. */
  engineCancelled: boolean | null;
  releasedAsset?: string;
  releasedAmount?: string;
}

export type CancelSeedResult =
  { ok: true; placements: CancelSeedPlacement[] } | { ok: false; reason: string; placements: CancelSeedPlacement[] };

export interface SeedOrderRef {
  orderId: string;
  side: 'buy' | 'sell';
  level: number;
}

/**
 * Deterministic seed order ids for a run (buy+sell × levels).
 * Never invents a market or run — caller supplies both.
 */
export function seedOrderIdsForRun(
  runId: string,
  marketId: string,
  levels: number,
  orderIdFor?: (side: 'buy' | 'sell', level: number) => string,
): SeedOrderRef[] {
  const out: SeedOrderRef[] = [];
  if (!Number.isInteger(levels) || levels < 1) return out;
  for (let level = 1; level <= levels; level++) {
    for (const side of ['buy', 'sell'] as const) {
      const orderId = orderIdFor?.(side, level) ?? mmSeedOrderIdFor(runId, marketId, side, level);
      out.push({ orderId, side, level });
    }
  }
  return out;
}

/**
 * Cancel house MM seed orders for a prior run and release remaining holds.
 *
 * Engine cancel first; on transport failure → cancel_indeterminate and do NOT
 * release (order may still be live). When engine answers (live or not), release
 * remaining hold from ledger balance — never invent the amount.
 */
export async function cancelSeedMarket(spec: CancelSeedSpec, deps: CancelSeedDeps): Promise<CancelSeedResult> {
  if (!spec.marketId.trim() || !spec.baseAsset.trim() || !spec.quoteAsset.trim()) {
    return { ok: false, reason: 'invalid_market', placements: [] };
  }
  if (!spec.runId.trim()) {
    return { ok: false, reason: 'missing_run_id', placements: [] };
  }
  if (!Number.isInteger(spec.levels) || spec.levels < 1 || spec.levels > 50) {
    return { ok: false, reason: 'invalid_levels', placements: [] };
  }

  const placements: CancelSeedPlacement[] = [];
  let anyIndeterminate = false;
  let anyReleaseFailed = false;

  for (const ref of seedOrderIdsForRun(spec.runId, spec.marketId, spec.levels, deps.orderIdFor)) {
    let engineCancelled: boolean | null = null;
    try {
      const cancelResult = await deps.matching.cancel(spec.marketId, ref.orderId);
      engineCancelled = cancelResult.cancelled;
    } catch {
      anyIndeterminate = true;
      placements.push({
        orderId: ref.orderId,
        side: ref.side,
        level: ref.level,
        status: 'cancel_indeterminate',
        engineCancelled: null,
      });
      continue;
    }

    // Buy holds quote, sell holds base — try primary then other (honest zero skip).
    const assets = ref.side === 'buy' ? [spec.quoteAsset, spec.baseAsset] : [spec.baseAsset, spec.quoteAsset];

    let released: { asset: string; amount: string } | null = null;
    let releaseFailed = false;

    for (const assetId of assets) {
      let amount: Amount;
      try {
        const bal = await deps.ledger.balance(marketMakerOrderHoldAccount(assetId, ref.orderId));
        amount = bal.amount;
      } catch {
        continue;
      }
      if (amount <= 0n) continue;
      try {
        await deps.ledger.post(
          recipes.marketMakerOrderHoldRelease({
            orderId: ref.orderId,
            assetId,
            amount,
            sequence: 0,
          }),
        );
        released = { asset: assetId, amount: formatAmount(amount) };
        break;
      } catch {
        releaseFailed = true;
        break;
      }
    }

    if (releaseFailed) {
      anyReleaseFailed = true;
      placements.push({
        orderId: ref.orderId,
        side: ref.side,
        level: ref.level,
        status: 'release_failed',
        engineCancelled,
      });
      continue;
    }

    let status: CancelSeedPlacementStatus;
    if (released) {
      status = engineCancelled ? 'cancelled_and_released' : 'not_live_released';
    } else {
      status = engineCancelled ? 'cancelled_no_hold' : 'not_live_no_hold';
    }

    placements.push({
      orderId: ref.orderId,
      side: ref.side,
      level: ref.level,
      status,
      engineCancelled,
      releasedAsset: released?.asset,
      releasedAmount: released?.amount,
    });
  }

  if (anyIndeterminate) {
    return { ok: false, reason: 'cancel_indeterminate', placements };
  }
  if (anyReleaseFailed) {
    return { ok: false, reason: 'release_failed', placements };
  }
  return { ok: true, placements };
}

export function summarizeCancelSeed(result: CancelSeedResult): string {
  if (!result.ok) {
    return `cancel fail (${result.reason}) placements=${result.placements.length}`;
  }
  const released = result.placements.filter((p) => p.status === 'cancelled_and_released' || p.status === 'not_live_released').length;
  return `cancel ok released=${released}/${result.placements.length}`;
}
