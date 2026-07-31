/**
 * Funding settlement planner (trade.futures residual).
 *
 * PURE: given open positions + an externally supplied funding rate, builds
 * ledger recipe inputs. Does NOT invent rates, does NOT post, does NOT touch
 * mark/oracle. A cron/job supplies rate + posts recipes.futuresFundingPay.
 *
 * Convention: positive rate → longs pay shorts (amount = |rate| * notional).
 * Rate is a decimal string in ABSOLUTE terms for the period (e.g. "0.0001" = 1bp).
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
  let seq = 0;
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
      seq += 1;
      const fundingId = `${input.periodId}:${payer.positionId}:${payee.positionId}:${seq}`;
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
  return legs;
}

/** Human-readable summary for logs / PR bodies. */
export function summarizeFundingPlan(legs: readonly FundingLeg[]): string {
  const total = legs.reduce((a, l) => a + l.amount, 0n);
  return `${legs.length} leg(s), total transfer ${formatAmount(total)}`;
}
