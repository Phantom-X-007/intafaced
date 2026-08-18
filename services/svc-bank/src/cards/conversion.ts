import { div, formatAmount, type Amount } from '@intafaced/ledger-client';
import { BankError } from '../errors.js';
import { acceptableForLiquidation, type MarkPolicy, type MarkQuality, type PriceSource, type QuotedMark } from '../loans/prices.js';

/**
 * JUST-IN-TIME CONVERSION (§18) — the quotation, and only the quotation.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT §18 PROMISES AND WHAT `bank.cards` SHIPPED
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * §18: "funds live in the user's smart account until the authorization moment;
 * spend pulls exact fiat equivalent via just-in-time conversion."
 *
 * What is on main is a card bound to ONE asset, authorised for an amount already
 * denominated in that same asset. There is no settlement currency, so there is
 * nothing to convert, and the phrase "JIT conversion" describes a step that does
 * not exist in the code. That gap is what this file closes — the CUSTODIAL half
 * of it. The self-custody half (the funds sitting in a contract the platform
 * cannot touch until the swipe) is a live chain and a smart account, which is
 * `protocol.smart-accounts` on the chain board and not code this service writes.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THIS FILE MOVES NO VALUE, AND THAT IS THE LOAD-BEARING SENTENCE
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * A conversion sounds like a trade, and a trade is two legs. It is not one here.
 *
 * What actually happens on OUR book is unchanged and is exactly what
 * `card-service.ts` already does: N units of the FUNDING asset go
 * available → hold → `rail/<issuer>/<funding asset>`. One asset, three accounts,
 * the same three recipes. What this file decides is the value of N — the size of
 * a movement, not a second movement — from a rate quoted at the authorisation
 * moment and then frozen.
 *
 * The counterparty who takes the other side of the conversion (hands the
 * merchant settlement currency and takes our funding asset at the rail boundary)
 * is part of `socket.live-issuer`. It is not us, we do not book its leg, and
 * booking it would be a second money book with a partner's name on it. What
 * leaves our book is what left our book; the boundary account is the honest
 * record of that and nothing more.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THERE IS NO RATE SOURCE IN THIS PLATFORM, AND THIS FILE DOES NOT INVENT ONE
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * The shell retired `getCNYRate` for precisely this reason — a fiat conversion
 * computed from a rate we invented is a price, not a decoration. So:
 *
 *   · The rate is a PORT, and it is the port `loans/prices.ts` already declares.
 *     `PriceSource` returns a mark for an asset quoted in another asset, carries
 *     its own `asOf`, and labels how it was derived. That is the shape a
 *     conversion rate has. A second interface meaning the same thing is how two
 *     subsystems come to disagree about what a stale price is, and the bank
 *     vertical ADR binds this vocabulary by name.
 *   · The DEFAULT is `noConversionRates`, which has no rates in it. A card whose
 *     settlement asset differs from its funding asset refuses every
 *     authorisation with `bank.mark_missing` until an adapter is chosen. Same
 *     posture as `noCardIssuer`: the dangerous default is the plausible one.
 *   · A missing rate is a REFUSAL, not a decline and not a zero. A decline is an
 *     answer — "your money is not there" — and answering it on behalf of a feed
 *     that never spoke is a lie the user pays for at the till. Nothing is
 *     written and nothing moves; a redelivery re-drives.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THE QUOTE IS FROZEN, AND WHAT BREAKS IF IT IS NOT
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * The rate is quoted ONCE, at the authorisation, and written down beside the
 * authorisation in the same database transaction that records the decision.
 * Capture and reversal read it; they never ask for it again.
 *
 * Re-quoting at capture is the bug this design exists to make impossible. The
 * hold is a fixed number of funding units, taken at the authorisation rate. If
 * capture converted the merchant's settlement amount at a NEW rate, then a rate
 * that moved between the swipe and the clearing settles a different number of
 * funding units than were held: too many and the capture overdraws an account
 * that only has the hold in it, too few and the hold never reaches zero and the
 * remainder is silently wrong. Either way the user is charged a rate they were
 * never shown, days after they agreed to a price at a till.
 *
 * The same freeze is what makes a retry safe. Two deliveries of one
 * authorisation converge on one row with one rate, so the second delivery cannot
 * move a different amount than the first.
 */

/**
 * A rate, frozen at the authorisation moment, and everything derived from it.
 *
 * `rate` is how many units of the SETTLEMENT asset one unit of the FUNDING asset
 * is worth — the direction `PriceSource.marks(assets, quoteAsset)` already
 * returns, so no inversion happens anywhere and there is no second convention to
 * get backwards.
 */
export interface ConversionQuote {
  readonly settlementAssetId: string;
  readonly settlementAmount: Amount;
  readonly fundingAssetId: string;
  /** What the hold, the capture and the reversal are all denominated in. */
  readonly fundingAmount: Amount;
  readonly rate: Amount;
  readonly quality: MarkQuality;
  readonly rateAsOf: Date;
}

/**
 * The gate a rate must pass before it is allowed to size a card spend.
 *
 * `MarkPolicy` unchanged from `loans/prices.ts`, plus one field the loan book
 * does not need. Extended rather than respelled, per the bank vertical ADR.
 */
export interface CardConversionPolicy extends MarkPolicy {
  /**
   * How far back a previously accepted rate may be and still arm the deviation
   * breaker.
   *
   * The breaker compares this rate against the last one this card converted at,
   * which is the loan book's shape — but a loan is re-marked by a sweep every
   * few minutes and a card may not be used for a month. Comparing today's swipe
   * against a rate from March would refuse a genuine market at a till, which is
   * a decline the user cannot act on and cannot understand. Outside this window
   * the breaker is not armed at all and the rate is treated as a first mark,
   * exactly as a loan's first mark is.
   */
  readonly deviationLookbackSeconds: number;
}

/**
 * THE BAR IS THE SEIZURE BAR, NOT THE WARNING BAR.
 *
 * `loans/prices.ts` splits the two on purpose: a margin call on a questionable
 * mark costs the borrower a notification, a liquidation on the same mark costs
 * them their collateral. A card spend has no warning half. There is one moment,
 * it takes the user's funds, and the merchant has the goods before anybody
 * reviews it — so both age bounds are the tight one, and `acceptableForLiquidation`
 * is the gate rather than `acceptableForMarking`.
 *
 * `last` is absent from `liquidationQualities` for the reason it is absent
 * there: one print on a thin book moves it, and a printed rate here does not
 * mis-value a position, it takes the wrong number of units out of somebody's
 * balance. A market with no two-sided quote cannot fund a card spend at all, and
 * the refusal says so.
 */
export const DEFAULT_CARD_CONVERSION_POLICY: CardConversionPolicy = {
  // An authorisation is a live moment. A minute-old rate is generous already.
  maxAgeSeconds: 60,
  liquidationMaxAgeSeconds: 60,
  maxDeviationBps: 2_000,
  liquidationQualities: ['index', 'mid'],
  deviationLookbackSeconds: 3_600,
};

/**
 * THE DEFAULT, AND IT HAS NO RATES IN IT.
 *
 * Not an oversight and not a placeholder for one. This platform has no FX
 * source: `svc-trade` publishes a crypto ticker, and there is no fiat rate feed
 * anywhere in the repo, which is why the shell deleted the one it had rather
 * than keep a number that looked like a price. A deployment that has not chosen
 * a rate adapter cannot convert, and every authorisation on a card that needs a
 * conversion refuses `bank.mark_missing`.
 *
 * Cards whose settlement asset IS their funding asset are unaffected: no rate is
 * consulted, because no conversion happens.
 */
export const noConversionRates: PriceSource = {
  marks: async () => new Map<string, QuotedMark>(),
};

/**
 * How many funding units a settlement amount costs at a given rate.
 *
 * CEIL, and deliberately. The rounding unit has to land on somebody and this
 * puts it on the user, in the same direction and for the same reason
 * `cashbackOn` floors: a unit invented in the user's favour is a unit the
 * platform hands to a rail out of its own pocket on every swipe, which is a leak
 * that compounds quietly. Under-charging by one attounit is invisible; a
 * systematic shortfall against a settlement rail is an operator's Monday.
 *
 * The property that matters more than the direction: this is MONOTONIC in the
 * settlement amount, so a partial capture can never convert to more funding
 * units than the whole authorisation held, and a full capture converts to
 * exactly what it held. That is what lets the hold account reach precisely zero.
 */
export function fundingFor(settlementAmount: Amount, rate: Amount): Amount {
  if (rate <= 0n) {
    // Second door. `acceptableForMarking` refuses non-positive marks at the
    // source; a zero rate reaching arithmetic is a broken feed, not a free card.
    throw new BankError(`Refusing to convert at a non-positive rate ${formatAmount(rate)}`, 'bank.mark_invalid');
  }
  return div(settlementAmount, rate, 'ceil');
}

/** The last rate this card converted at, when there is one recent enough to compare against. */
export interface PreviousRate {
  readonly rate: Amount;
  readonly acceptedAt: Date;
}

/**
 * Quote a card spend, or refuse by name.
 *
 * Throws rather than returning a decline, on both branches, and the distinction
 * is the one `authorize()` already draws between "your money is not there" and
 * "the ledger never answered". A rate we could not get is the second kind: we do
 * not know what this purchase costs, so we have not decided anything, and
 * recording a decline would put a decision in the user's history that nobody
 * took.
 */
export async function quoteConversion(input: {
  readonly rates: PriceSource;
  readonly fundingAssetId: string;
  readonly settlementAssetId: string;
  readonly settlementAmount: Amount;
  readonly previous: PreviousRate | null;
  readonly now: Date;
  readonly policy: CardConversionPolicy;
}): Promise<ConversionQuote> {
  const marks = await input.rates.marks([input.fundingAssetId], input.settlementAssetId);
  const mark = marks.get(input.fundingAssetId);

  if (!mark) {
    // A missing rate is not a rate of zero and not a rate of one. Omitted at the
    // source, refused here — the same shape as `valueAt`'s missing-mark refusal.
    throw new BankError(
      `No rate for ${input.fundingAssetId} in ${input.settlementAssetId} — refusing to convert a card spend at a rate ` + `nobody quoted`,
      'bank.mark_missing',
    );
  }

  // Only compare against a previous rate that is recent enough to mean anything.
  const previousRate =
    input.previous && (input.now.getTime() - input.previous.acceptedAt.getTime()) / 1_000 <= input.policy.deviationLookbackSeconds
      ? input.previous.rate
      : null;

  const check = acceptableForLiquidation(mark, previousRate, input.now, input.policy);
  if (!check.ok) {
    throw new BankError(`Refusing to convert this card spend on that rate — ${check.reason}`, 'bank.mark_unusable');
  }

  return {
    settlementAssetId: input.settlementAssetId,
    settlementAmount: input.settlementAmount,
    fundingAssetId: input.fundingAssetId,
    fundingAmount: fundingFor(input.settlementAmount, mark.price),
    rate: mark.price,
    quality: mark.quality,
    rateAsOf: mark.asOf,
  };
}
