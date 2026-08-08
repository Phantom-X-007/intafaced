/**
 * Funding settlement planner (trade.futures residual).
 *
 * PURE: given open positions + an externally supplied funding rate, builds
 * ledger recipe inputs. Does NOT invent rates, does NOT post, does NOT touch
 * mark/oracle. A cron/job supplies rate + posts recipes.futuresFundingPay.
 *
 * Convention: positive rate → longs pay shorts (amount = |rate| * notional).
 * Rate is a decimal string in ABSOLUTE terms for the period (e.g. "0.0001" = 1bp).
 *
 * ── The ledger key is `(period, payer, payee)`, and it must stay that way ────
 *
 * `runFundingTick` posts these legs BEFORE it writes the settle marker, so a
 * crash in that gap replays the whole plan. The replay is only safe because the
 * ledger dedupes on the recipe key — which means the key has to identify the
 * WORK, not where the work happened to land in a loop.
 *
 * This previously appended `:${seq}`, a counter running across the nested
 * payer×payee loop. Nothing needed it — each (payer, payee) pair is emitted at
 * most once per plan, so the three ids were already unique — and it broke the
 * only property that mattered: a replay whose book has changed (one short
 * closed their position in between, which needs no job enabled and is a plain
 * `DELETE /api/v1/positions/:id`) renumbers every downstream leg. The surviving
 * pairs then arrive at the ledger under keys it has never seen, and post a
 * SECOND time. Meanwhile `applyFundingNets` is idempotent on (position, period)
 * and correctly does nothing, so `margin_current` records one charge while the
 * ledger has taken two — the inverse of #1034, reached through the gap #1047
 * left open. That is the third funding double-charge in this file's history;
 * the first two are #1034 and #1047.
 *
 * KNOWN RESIDUAL, deliberately not fixed here: the loader returns positions
 * open *now*, not positions open as of the period. A position OPENED between a
 * failed attempt and its replay is a genuinely new pair with a genuinely new
 * key, so the replay posts an extra leg.
 *
 * The victim is NOT the new position — it is consistent, charged once in both
 * the ledger and its margin. The victim is the PAYER, whose collateral the
 * ledger drains for both the original legs and the new one while
 * `applyFundingNets` (idempotent on (position, period)) records only the first.
 * That is the same ledger-vs-`margin_current` divergence as #1034 and #1047,
 * which is the thing to say out loud: this residual is in the same family as
 * the bug above it, not a fairness question about period membership.
 *
 * It is unchanged by this fix — measured identical under the old and new keys —
 * so nothing was traded away. Closing it needs a decision about what a period's
 * membership IS, which is product law, not a refactor.
 */
import { formatAmount, mul, parseAmount, recipes, type Amount, type PostRequest } from '@intafaced/ledger-client';

export interface FundingOpenPosition {
  positionId: string;
  userId: string;
  side: 'long' | 'short';
  /** Absolute contracts (size). */
  size: Amount;
  entryPrice: Amount;
  marginAsset: string;
}

export interface FundingPlanInput {
  /** Unique period key, e.g. marketId + ISO period start. */
  periodId: string;
  marketId: string;
  /**
   * Period funding rate as decimal string (absolute, not bps).
   * Positive: longs pay shorts. Negative: shorts pay longs.
   */
  rate: string;
  positions: readonly FundingOpenPosition[];
}

export interface FundingLeg {
  recipe: PostRequest;
  payerPositionId: string;
  payeePositionId: string;
  amount: Amount;
}

const SCALE = 10n ** 18n;

/** Notional in quote scaled units: size * entry / SCALE. */
export function notionalQuote(size: Amount, entryPrice: Amount): Amount {
  return (size * entryPrice) / SCALE;
}

/**
 * Payment for one side pair in a period.
 * amount = |rate| * notional (both scaled amounts).
 */
export function fundingAmount(notional: Amount, rateAbs: Amount): Amount {
  if (notional <= 0n || rateAbs <= 0n) return 0n;
  return (notional * rateAbs) / SCALE;
}

/**
 * Build funding pay recipes: each long pairs against proportional shorts by
 * notional weight. Simple v1: net long notional vs net short notional —
 * each long pays pro-rata of total funding to shorts as a pool via sequential
 * pairwise legs (long i pays each short j proportional share).
 *
 * For skeleton honesty we use a simpler algorithm:
 * - Compute total long notional L and short notional S
 * - Matchable = min(L, S)
 * - Total transfer = |rate| * matchable
 * - Each long pays (longNotional/L) * total if L>0
 * - Each short receives (shortNotional/S) * total if S>0
 * - Legs: for each long, for each short, amount = longPay * shortShare
 *   (so sum of legs from a long = their full pay)
 */
export function planFundingSettlement(input: FundingPlanInput): FundingLeg[] {
  const rate = parseAmount(input.rate);
  if (rate === 0n) return [];

  const longs = input.positions.filter((p) => p.side === 'long');
  const shorts = input.positions.filter((p) => p.side === 'short');
  if (longs.length === 0 || shorts.length === 0) return [];

  const longN = longs.map((p) => ({ p, n: notionalQuote(p.size, p.entryPrice) }));
  const shortN = shorts.map((p) => ({ p, n: notionalQuote(p.size, p.entryPrice) }));
  const L = longN.reduce((a, x) => a + x.n, 0n);
  const S = shortN.reduce((a, x) => a + x.n, 0n);
  if (L <= 0n || S <= 0n) return [];

  const matchable = L < S ? L : S;
  const rateAbs = rate < 0n ? -rate : rate;
  const total = fundingAmount(matchable, rateAbs);
  if (total <= 0n) return [];

  // Positive rate: longs pay. Negative: shorts pay (flip sides).
  const payers = rate > 0n ? longN : shortN;
  const payees = rate > 0n ? shortN : longN;
  const payerPool = rate > 0n ? L : S;
  const payeePool = rate > 0n ? S : L;

  const legs: FundingLeg[] = [];
  for (const { p: payer, n: pn } of payers) {
    const payerShare = (total * pn) / payerPool;
    if (payerShare <= 0n) continue;
    let remaining = payerShare;
    for (let i = 0; i < payees.length; i++) {
      const { p: payee, n: sn } = payees[i]!;
      const isLast = i === payees.length - 1;
      const piece = isLast ? remaining : (payerShare * sn) / payeePool;
      if (piece <= 0n) continue;
      remaining -= piece;
      // (period, payer, payee) and nothing else. Each pair is emitted at most
      // once per plan, so this is already unique — and unlike a loop counter it
      // is the SAME key when the tick replays. See the header note.
      const fundingId = `${input.periodId}:${payer.positionId}:${payee.positionId}`;
      legs.push({
        payerPositionId: payer.positionId,
        payeePositionId: payee.positionId,
        amount: piece,
        recipe: recipes.futuresFundingPay({
          fundingId,
          payerUserId: payer.userId,
          payerPositionId: payer.positionId,
          payeeUserId: payee.userId,
          payeePositionId: payee.positionId,
          assetId: payer.marginAsset,
          amount: piece,
        }),
      });
    }
  }

  // The invariant the ledger keys rest on, asserted where it lives.
  //
  // Uniqueness holds because payers and payees are disjoint by side and each
  // pair is visited once — but only as long as `positions` carries no duplicate
  // position id. Today that is guaranteed by a PRIMARY KEY two files away, in
  // another module, with nothing here that would notice if it stopped being
  // true. And the failure would be silent in the worst direction: the ledger
  // would dedupe the colliding leg away and take LESS than `applyFundingNets`
  // decrements from margin, so the row and the money disagree with no error.
  //
  // Cheaper to refuse the plan than to discover that in a reconcile.
  const keys = new Set(legs.map((l) => l.recipe.idempotencyKey));
  if (keys.size !== legs.length) {
    throw new Error(
      `funding plan for ${input.periodId} produced ${legs.length} legs under ${keys.size} distinct ledger keys — ` +
        `refusing to post a plan whose legs would silently dedupe against each other`,
    );
  }

  return legs;
}

/** Human-readable summary for logs / PR bodies. */
export function summarizeFundingPlan(legs: readonly FundingLeg[]): string {
  const total = legs.reduce((a, l) => a + l.amount, 0n);
  return `${legs.length} leg(s), total transfer ${formatAmount(total)}`;
}
