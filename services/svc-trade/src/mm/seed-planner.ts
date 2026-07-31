/**
 * Market-maker seed planner (trade.mm-bot residual).
 *
 * PURE: external mid + params → list of limit quote intents.
 * Does NOT invent mid, does NOT post orders, does NOT touch ledger.
 * A seeder job supplies mid (from external oracle or explicit config) and
 * posts via trade money path with house market-maker funding.
 *
 * House account id for matching STP is caller's concern (ledger: house/market-maker).
 */
import { parseAmount, type Amount } from '@intafaced/ledger-client';

const SCALE = 10n ** 18n;

export interface SeedLevelIntent {
  side: 'buy' | 'sell';
  /** Limit price as decimal string. */
  price: string;
  /** Order size as decimal string. */
  qty: string;
  /** Level index 1..n from best. */
  level: number;
}

export interface SeedPlanInput {
  /**
   * External mid price — decimal string. Never invent.
   * Null/empty/non-positive → plan refuses.
   */
  midPrice: string | null | undefined;
  /** Half-spread from mid for first level, in bps (e.g. 5 = 0.05%). */
  halfSpreadBps: number;
  /** Extra bps between successive levels. */
  stepBps: number;
  /** Number of levels per side (buy and sell each get this many). */
  levels: number;
  /** Size per level (decimal string). */
  qtyPerLevel: string;
}

export type SeedPlan = { ok: true; mid: Amount; intents: SeedLevelIntent[] } | { ok: false; reason: string };

function formatScaled(v: bigint): string {
  if (v <= 0n) return '0';
  const whole = v / SCALE;
  let frac = (v % SCALE).toString().padStart(18, '0').replace(/0+$/, '');
  return frac.length === 0 ? whole.toString() : `${whole}.${frac}`;
}

function parsePositiveDecimal(s: string): Amount | null {
  const t = s.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  if (!/[1-9]/.test(t)) return null;
  try {
    return parseAmount(t);
  } catch {
    return null;
  }
}

/** Apply bps offset: price * (1 + sign*bps/10000). */
export function priceAtBps(mid: Amount, bps: number, side: 'buy' | 'sell'): Amount {
  // buy below mid → negative offset; sell above → positive
  const signed = side === 'buy' ? -bps : bps;
  // mid * (10000 + signed) / 10000
  const num = mid * BigInt(10_000 + signed);
  return num / 10_000n;
}

/**
 * Build two-sided seed intents from an external mid.
 * Refuses when mid missing or params invalid — empty books stay empty (honest).
 */
export function planSeedQuotes(input: SeedPlanInput): SeedPlan {
  if (input.midPrice == null || String(input.midPrice).trim() === '') {
    return { ok: false, reason: 'missing_mid' };
  }
  const mid = parsePositiveDecimal(String(input.midPrice));
  if (mid == null) {
    return { ok: false, reason: 'invalid_mid' };
  }
  if (!Number.isInteger(input.halfSpreadBps) || input.halfSpreadBps < 0 || input.halfSpreadBps > 5_000) {
    return { ok: false, reason: 'invalid_half_spread_bps' };
  }
  if (!Number.isInteger(input.stepBps) || input.stepBps < 0 || input.stepBps > 5_000) {
    return { ok: false, reason: 'invalid_step_bps' };
  }
  if (!Number.isInteger(input.levels) || input.levels < 1 || input.levels > 50) {
    return { ok: false, reason: 'invalid_levels' };
  }
  const qty = parsePositiveDecimal(input.qtyPerLevel);
  if (qty == null) {
    return { ok: false, reason: 'invalid_qty' };
  }

  const intents: SeedLevelIntent[] = [];
  const qtyStr = formatScaled(qty);

  for (let i = 0; i < input.levels; i++) {
    const level = i + 1;
    const bps = input.halfSpreadBps + i * input.stepBps;
    const bid = priceAtBps(mid, bps, 'buy');
    const ask = priceAtBps(mid, bps, 'sell');
    if (bid <= 0n || ask <= 0n || ask <= bid) {
      return { ok: false, reason: 'crossed_or_nonpositive' };
    }
    intents.push({ side: 'buy', price: formatScaled(bid), qty: qtyStr, level });
    intents.push({ side: 'sell', price: formatScaled(ask), qty: qtyStr, level });
  }

  return { ok: true, mid, intents };
}

export function summarizeSeedPlan(plan: SeedPlan): string {
  if (!plan.ok) return `skip (${plan.reason})`;
  return `seed ${plan.intents.length} intents around mid=${formatScaled(plan.mid)}`;
}
