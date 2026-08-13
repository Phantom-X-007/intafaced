/**
 * Seed / MM honesty contract (D26-P1-T10 · Spec SD-2…SD-5).
 *
 * Coordinates with tracker `trade.mm-bot`: backend honesty only — no FE,
 * no invented mids, no manufactured crosses.
 *
 * Done bar (board):
 *   · Seeded flagged (SD-2)
 *   · Not in user volume / public tape (SD-3)
 *   · Killable (SD-4)
 *   · No manufactured crosses (SD-5)
 *
 * PURE helpers + result classifiers. Money posts stay in seed-market /
 * trade-service; this module is the shared law those paths must obey.
 */
import type { EngineSubmitRequest, EngineSubmitResult } from '../spot/matching-client.js';

/** Seed submits are limit post-only — never market / IOC take (SD-5). */
export const MM_SEED_ORDER_TYPE = 'limit' as const;
export const MM_SEED_TIF = 'PO' as const;

/**
 * Every resting MM seed order is seeded liquidity (SD-2).
 * Durable `trade.orders.seeded` is written by the recorder port / fill stub;
 * this constant is the API/placement claim that must stay true.
 */
export const MM_SEED_ORDER_SEEDED = true as const;

/**
 * Seed volume is never "real activity" (SD-3).
 * Public tape / candles / 24h volume must exclude any fill that touches a
 * seeded order — see trade-service `publicTape` + `candles.ts`.
 */
export function seedVolumeCountsTowardUserStats(): false {
  return false;
}

/**
 * Kill-switch surface (SD-4): jobs arm only when ops enables AND names markets.
 * Empty targets stay unarmed even if enabled — never invent a market list.
 */
export function mmSeedJobsArmed(enabled: boolean, targetCount: number): boolean {
  return enabled === true && Number.isFinite(targetCount) && targetCount > 0;
}

export type SeedSubmitHonesty =
  { ok: true; kind: 'resting' } | { ok: false; kind: 'rejected' | 'manufactured_cross' | 'no_resting'; reason: string };

/**
 * Classify an engine submit result for seed honesty (SD-5).
 *
 * Any synchronous fill on a seed submit is a manufactured cross — even if the
 * engine also returns a resting remnant. Seed must release and refuse to treat
 * that placement as honest resting liquidity.
 */
export function classifySeedSubmitResult(
  result: Pick<EngineSubmitResult, 'accepted' | 'rejected' | 'fills' | 'resting'>,
): SeedSubmitHonesty {
  if (result.fills.length > 0) {
    return { ok: false, kind: 'manufactured_cross', reason: 'seed_submit_produced_fills' };
  }
  if (!result.accepted || result.rejected) {
    return {
      ok: false,
      kind: 'rejected',
      reason: result.rejected?.code ?? 'not_accepted',
    };
  }
  if (!result.resting) {
    return { ok: false, kind: 'no_resting', reason: 'no_resting' };
  }
  return { ok: true, kind: 'resting' };
}

/**
 * Shape the matching submit must take for house MM seed (SD-5).
 * Tests freeze this so a regression to market/IOC cannot green quietly.
 */
export function seedSubmitShape(
  partial: Pick<EngineSubmitRequest, 'orderId' | 'accountId' | 'side' | 'qty' | 'price'>,
): Pick<EngineSubmitRequest, 'type' | 'tif' | 'orderId' | 'accountId' | 'side' | 'qty' | 'price'> {
  return {
    ...partial,
    type: MM_SEED_ORDER_TYPE,
    tif: MM_SEED_TIF,
  };
}

/** True when a matching submit request obeys seed make-only law. */
export function isHonestSeedSubmit(request: Pick<EngineSubmitRequest, 'type' | 'tif'>): boolean {
  return request.type === MM_SEED_ORDER_TYPE && request.tif === MM_SEED_TIF;
}
