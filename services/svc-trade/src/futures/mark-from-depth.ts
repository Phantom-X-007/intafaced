/**
 * Mark from matching depth (trade.futures residual).
 *
 * Adapts EngineDepth (bids/asks levels) into a QuotedMarkSource via
 * mid-of-book. Empty or one-sided book → null (never invent). Depth carries no
 * last print, so every quote this source produces is `mid` quality.
 *
 * Does not call matching itself; inject depth reader (svc-matching port).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MID USED TO BE SIZE-BLIND
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `bestFromDepth` read `depth.bids[0]?.[0]` and `depth.asks[0]?.[0]` — the PRICE
 * at each best level — and threw away the QUANTITY at index 1 entirely. So one
 * wei resting at 1000 and one wei resting at 3000 minted a payout-grade `mid` of
 * 2000, and a close priced off it paid real money out of the profit pot. It was
 * measured before it was fixed: 2,000 USDT on a ten-unit long, against a book
 * holding two orders worth about four femto-cents between them
 * (`position-service.test.ts`, "two dust orders mint a payout-grade mark").
 *
 * This is not exploitable on `main` today only because `assertTradable` refuses
 * non-spot on the order path, so futures books are always empty. That is a
 * different file's accident, not a control: the change that makes futures
 * markets orderable turns this into self-dealing with two dust orders, no
 * capital at risk, and no further code needed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SO: A BOOK TOO THIN TO BE WORTH ANYTHING IS NOT A QUOTE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A side whose best level carries less than `minBestLevelNotional` is treated as
 * ABSENT, not as cheap. One side absent makes the book one-sided, and a
 * one-sided book already has exactly one honest answer here: null. The refusal
 * therefore arrives through machinery that already existed — no new error code,
 * no second refusal vocabulary.
 *
 * REFUSING RATHER THAN DEGRADING, deliberately. The two alternatives were:
 *
 *   · label it `last`, which the liquidation gate refuses anyway but the
 *     VALUATION gate accepts — so a dust mid would still reach margin-call
 *     arithmetic and a trader's screen as though someone had quoted it;
 *   · walk past the dust to the first level with real size, which invents a
 *     price nobody is actually resting at the top of the book, and quietly
 *     changes what "best bid" means in a file whose whole job is not inventing.
 *
 * Both hide a book that cannot support a trade. "An illiquid book is exactly
 * where a forced sale does most damage" (`prices.ts`) — and it is also exactly
 * where a payout does. The position sits and an operator looks at it, which is
 * the answer this codebase has already chosen twice for the same shape of
 * problem.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE NUMBER IS A RISK PARAMETER AND IT IS THE OWNER'S
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/adr/2026-08-05-futures-risk-and-mark-law.md` reserves "any leverage or
 * margin parameter beyond §1's stated defaults" to the owner (`DIRECTION` §8
 * item 8). A minimum book depth is one of those. What is implemented here is the
 * MECHANISM and its refusal; the number is a conservative placeholder, it lives
 * in exactly one named constant, and it is per-deployment configuration rather
 * than something scattered through the call sites.
 */
import { parseAmount, type Amount } from '@intafaced/ledger-client';
import type { EngineDepth } from '../spot/matching-client.js';
import type { QuotedMarkSource } from './liquidation-tick.js';
import { markSourceFromBook } from './mark-source.js';
import type { MarkPolicy } from './mark-policy.js';

/**
 * MINIMUM RESTING NOTIONAL AT A BEST LEVEL, IN QUOTE-ASSET UNITS.
 *
 * `100` means: for a `BTC/USDT-PERP` book, the best bid and the best ask must
 * each be worth at least 100 USDT (price × quantity) before their mid may be
 * minted as a payout-grade mark. Two 1-wei orders come to roughly 1e-15 quote
 * units and are refused by fifteen orders of magnitude.
 *
 * Conservative and deliberately unambitious: it is chosen to be far above dust
 * and far below anything a real market maker rests, so it catches the attack
 * without opining on what a liquid book looks like. It is a placeholder for an
 * owner ruling, not a considered risk limit.
 *
 * KNOWN LIMITATION, stated rather than papered over: the threshold is one number
 * in QUOTE units and is applied to every futures market. That is right while
 * every futures market is quoted in USDT and wrong the day one is quoted in BTC,
 * where 100 of the quote asset is an enormous order. Per-market thresholds are a
 * risk-parameter table and squarely the owner's call, so this file does not
 * invent one — it takes a policy object so the owner's answer has somewhere to
 * land without touching any call site.
 */
export const DEFAULT_MIN_BEST_LEVEL_NOTIONAL = '100';

export interface DepthQuotePolicy {
  /**
   * Decimal string, quote-asset units. A best level worth less than this is
   * read as no level at all. See `DEFAULT_MIN_BEST_LEVEL_NOTIONAL`.
   */
  readonly minBestLevelNotional: string;
}

export const DEFAULT_DEPTH_QUOTE_POLICY: DepthQuotePolicy = {
  minBestLevelNotional: DEFAULT_MIN_BEST_LEVEL_NOTIONAL,
};

export type DepthReader = (marketId: string) => Promise<EngineDepth | null>;

const SCALE = 10n ** 18n;

/** Scaled-bigint notional of one depth level, or null when it is not readable. */
function levelNotional(level: readonly [string, string] | undefined): Amount | null {
  if (!level) return null;
  const [price, quantity] = level;
  if (price == null || price.length === 0 || quantity == null || quantity.length === 0) return null;
  try {
    const p = parseAmount(price);
    const q = parseAmount(quantity);
    if (p <= 0n || q <= 0n) return null;
    // Both operands are 1e18-scaled, so the product is 1e36-scaled. No floats.
    return (p * q) / SCALE;
  } catch {
    return null;
  }
}

/**
 * Best bid/ask price strings from depth levels, or null if the side is empty —
 * or too thin to be worth quoting, which this file treats as the same thing.
 *
 * The policy argument defaults rather than being required, because the unsafe
 * reading must not be the one you get by leaving an argument off. There is no
 * way to call this function and be handed a dust mid.
 */
export function bestFromDepth(
  depth: EngineDepth | null | undefined,
  policy: DepthQuotePolicy = DEFAULT_DEPTH_QUOTE_POLICY,
): {
  bestBid: string | null;
  bestAsk: string | null;
} {
  if (!depth) return { bestBid: null, bestAsk: null };

  let minimum: Amount;
  try {
    minimum = parseAmount(policy.minBestLevelNotional);
  } catch {
    // An unreadable threshold is not permission to skip the check.
    minimum = parseAmount(DEFAULT_MIN_BEST_LEVEL_NOTIONAL);
  }

  const side = (level: readonly [string, string] | undefined): string | null => {
    const notional = levelNotional(level);
    if (notional == null || notional < minimum) return null;
    return level![0]!;
  };

  return { bestBid: side(depth.bids[0]), bestAsk: side(depth.asks[0]) };
}

/**
 * QuotedMarkSource that mids the injected book. Never invents when empty, and
 * never mints a mid from a book too thin to support one.
 * `last` is always null here — last print is a separate feed.
 */
export function markSourceFromDepth(readDepth: DepthReader, policy?: MarkPolicy, depthPolicy?: DepthQuotePolicy): QuotedMarkSource {
  return markSourceFromBook({
    policy,
    async readBook(marketId) {
      const depth = await readDepth(marketId);
      if (!depth) return null;
      const { bestBid, bestAsk } = bestFromDepth(depth, depthPolicy ?? DEFAULT_DEPTH_QUOTE_POLICY);
      return { bestBid, bestAsk, last: null };
    },
  });
}
