/**
 * Market-maker seeder (trade.mm-bot residual).
 *
 * Orchestrates: external mid → planSeedQuotes → ledger marketMakerOrderHold →
 * matching submit (post-only GTC limits) under house MM identity.
 *
 * Does NOT invent mid, market list, or inventory. Fund the pot first via
 * marketMakerSeedFund. House-side fill settlement (tradeFill for MM) is still
 * residual — seed uses post-only so orders rest or reject, never take.
 *
 * Default: call site / ops enables. This module is pure orchestration with
 * injected ports — no wall-clock job here.
 */
import { formatAmount, mul, parseAmount, recipes, type Amount, type LedgerClient } from '@intafaced/ledger-client';
import type { EngineSubmitResult, MatchingClient } from '../spot/matching-client.js';
import { planSeedQuotes, type SeedLevelIntent, type SeedPlanInput } from './seed-planner.js';

/** Matching STP account for house market-maker — distinct from user ids. */
export const MM_MATCHING_ACCOUNT_ID = 'house:market-maker';

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
  // Deterministic: same run + market + side + level → same hold key.
  return `mm-seed:${runId}:${marketId}:${intent.side}:L${intent.level}`;
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
