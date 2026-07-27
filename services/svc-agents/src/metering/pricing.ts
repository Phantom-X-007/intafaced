import { formatAmount, type Amount } from '@intafaced/ledger-client';
import { TOKENS_PER_PRICE_UNIT, type ModelPrice } from '../gateway/routing.js';
import type { TokenUsage } from '../providers/provider.js';

/**
 * COST, EXACTLY (§8.2 "token/cost metering per user").
 *
 * Everything in this file is integer arithmetic on `Amount` — scaled bigint,
 * 18 decimals, the same representation the ledger uses. No `number` touches a
 * price or a cost at any point, including intermediates.
 *
 * ── Where the rounding happens, and why it happens exactly once ─────────────
 *
 * A rate is "X per million tokens", so a cost is `rate × tokens ÷ 1,000,000`.
 * That division is the only place precision can be lost, and where it happens
 * decides how much is lost:
 *
 *   · Rounding PER CALL, then summing → one rounding unit of error per call.
 *     A thousand-call session accrues a thousand of them, all in the same
 *     direction, and the drift is a function of how chatty the agent was.
 *
 *   · Summing exact token COUNTS first, then rounding ONCE per (window, rate)
 *     → at most one rounding unit per distinct rate in the window. Integer
 *     counts sum losslessly, so the only inexactness left is the final
 *     division.
 *
 * The second is what this service does. `usage_records` stores counts, never
 * costs; `windowCost` is called once, at settlement. The cost of a single call
 * is therefore a derived, informational number (`usageCost`) and never
 * something the ledger sees.
 *
 * Direction: `ceil`, matching `mulBps`'s fee convention in ledger-client —
 * a fee that rounds to zero is a fee the house pays. At 18 decimals the bias is
 * at most 1e-18 of the fee asset per rate per window, which is to say: real,
 * bounded, documented, and not a place anyone will ever find a rounding
 * scandal.
 */

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

/**
 * `tokens × pricePerMillion ÷ 1,000,000`, rounded up.
 *
 * Written out rather than composed from `mul`/`div` in money.ts deliberately:
 * composing them would round twice (once for the product, once for the
 * quotient), and the whole point of this function is that it rounds once.
 */
export function tokenCost(tokens: number | bigint, pricePerMillion: Amount): Amount {
  const n = typeof tokens === 'bigint' ? tokens : BigInt(assertCount(tokens));
  if (n < 0n) throw new PricingError(`Token count must not be negative, got ${n}`);
  if (pricePerMillion < 0n) throw new PricingError(`Price must not be negative, got ${formatAmount(pricePerMillion)}`);

  const numerator = n * pricePerMillion;
  const quotient = numerator / TOKENS_PER_PRICE_UNIT;
  return numerator % TOKENS_PER_PRICE_UNIT === 0n ? quotient : quotient + 1n;
}

/**
 * Cost of a single call. Informational — for spans, for a "what did that
 * cost" display, and for the per-session spend guardrail.
 *
 * NOT what gets billed. Billing goes through `windowCost` so the rounding
 * discipline above holds; summing this function over a session would be the
 * per-call rounding it exists to avoid.
 */
export function usageCost(usage: TokenUsage, price: ModelPrice): Amount {
  return tokenCost(usage.inputTokens, price.inputPerMillion) + tokenCost(usage.outputTokens, price.outputPerMillion);
}

/**
 * One rate's worth of a window: exact token totals plus the rate they were
 * quoted at.
 *
 * The rate is part of the group because it is snapshotted per usage record. A
 * price change mid-window must not re-price calls that already happened, and
 * the only way to guarantee that is to carry the rate with the usage rather
 * than look it up at settlement.
 */
export interface UsageGroup {
  readonly inputTokens: bigint;
  readonly outputTokens: bigint;
  readonly price: ModelPrice;
}

/**
 * The billable amount for a window.
 *
 * Counts are summed exactly per rate group; each group rounds once. Two groups
 * at the same rate would be a caller bug, so they are merged first — otherwise
 * splitting a window's rows differently would change the bill, and a bill that
 * depends on row grouping is not reproducible.
 */
export function windowCost(groups: readonly UsageGroup[]): Amount {
  const merged = new Map<string, UsageGroup>();

  for (const group of groups) {
    const key = `${group.price.inputPerMillion}:${group.price.outputPerMillion}`;
    const existing = merged.get(key);
    merged.set(
      key,
      existing
        ? {
            inputTokens: existing.inputTokens + group.inputTokens,
            outputTokens: existing.outputTokens + group.outputTokens,
            price: existing.price,
          }
        : group,
    );
  }

  let total: Amount = 0n;
  for (const group of merged.values()) {
    total += tokenCost(group.inputTokens, group.price.inputPerMillion);
    total += tokenCost(group.outputTokens, group.price.outputPerMillion);
  }
  return total;
}

function assertCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new PricingError(`Token counts are non-negative integers, got ${value}`);
  }
  return value;
}

/**
 * The usage window a moment belongs to, as `YYYY-MM-DDTHH` style buckets.
 *
 * A window is a billing period, so its identity must be derivable from a
 * timestamp alone and identical on every replica — hence UTC and a fixed
 * arithmetic derivation rather than anything locale- or clock-dependent.
 * `windowMinutes` must divide a day evenly so windows never straddle midnight.
 */
export function windowIdFor(at: Date, windowMinutes: number): string {
  if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || (24 * 60) % windowMinutes !== 0) {
    throw new PricingError(`Usage window must be a whole number of minutes dividing 1440, got ${windowMinutes}`);
  }

  const minutesIntoDay = at.getUTCHours() * 60 + at.getUTCMinutes();
  const slot = Math.floor(minutesIntoDay / windowMinutes);
  const day = at.toISOString().slice(0, 10);
  return `${day}#${String(slot).padStart(4, '0')}`;
}
