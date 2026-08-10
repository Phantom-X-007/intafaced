import { fiat, isSupportedFiat } from '@intafaced/config';
import { SCALE, compare, formatAmount, mul, type Amount, type Rounding } from '@intafaced/ledger-client';

/**
 * P2P PRICING (§6.2) — pure, no I/O.
 *
 * Two price types, one rule: **this service never sources a price.** A `fixed`
 * offer carries its own; a `float` offer carries a multiplier and needs a
 * reference from outside. If the reference is missing we refuse the take rather
 * than guess — the same rule that stops svc-token deciding a price (§4.3).
 *
 * Fiat is money, so fiat is `Amount` (scaled bigint), not `number`. A P2P trade
 * where the crypto leg is exact to 18dp and the fiat leg went through a double
 * is a trade where the two legs disagree, and the party who notices is the one
 * who lost the difference.
 */

export class PricingError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'p2p.unsupported_fiat'
      | 'p2p.reference_price_unavailable'
      | 'p2p.amount_below_min'
      | 'p2p.amount_above_max'
      | 'p2p.insufficient_offer_liquidity'
      | 'p2p.invalid_amount'
      | 'p2p.offer_methods_required'
      | 'p2p.offer_method_no_destination',
  ) {
    super(message);
    this.name = 'PricingError';
  }
}

export type PriceType = 'fixed' | 'float';

/**
 * A reference price feed for floating offers.
 *
 * Deliberately an interface with no implementation in this PR: pricing belongs
 * to svc-trade (§5.2), and svc-p2p consuming a mark price it did not compute is
 * the correct dependency direction. Returning `null` is a first-class answer —
 * "no price" must be refusable, not fillable with a stale number.
 */
export interface ReferencePriceSource {
  /** Fiat per one unit of `asset`, or null when there is no usable mark. */
  price(asset: string, fiatCurrency: string): Promise<Amount | null>;
}

/**
 * The quantum of one minor unit for a currency, as a scaled Amount.
 * JPY → 1, USD → 0.01, KWD → 0.001. Read from `packages/config` (§6.2:
 * "100+ fiat currencies = config, not code").
 */
export function minorUnitQuantum(fiatCurrency: string): Amount {
  const currency = fiat(fiatCurrency);
  if (!currency) throw new PricingError(`Unknown fiat currency "${fiatCurrency}"`, 'p2p.unsupported_fiat');
  return SCALE / 10n ** BigInt(currency.minorUnits);
}

/**
 * Quantise a fiat amount to the currency's smallest payable unit.
 *
 * A trade for ¥1234.56 is a trade for an amount no bank will move: the buyer
 * would send ¥1235 or ¥1234, one of them would be "wrong", and the seller would
 * be within their rights to dispute. Rounding here, once, at take time, is what
 * makes `fiat_amount` a number a human can actually pay.
 *
 * `half-up` by default and stated explicitly, because "whichever way the
 * language rounds" is how a book drifts.
 */
export function quantiseFiat(value: Amount, fiatCurrency: string, rounding: Rounding = 'half-up'): Amount {
  return roundToQuantum(value, minorUnitQuantum(fiatCurrency), rounding);
}

function roundToQuantum(value: Amount, quantum: Amount, rounding: Rounding): Amount {
  if (quantum <= 0n) throw new PricingError('Currency quantum must be positive', 'p2p.invalid_amount');
  const negative = value < 0n;
  const abs = negative ? -value : value;

  const whole = abs / quantum;
  const remainder = abs % quantum;
  let units = whole;

  if (remainder !== 0n) {
    switch (rounding) {
      case 'ceil':
        if (!negative) units += 1n;
        break;
      case 'floor':
        if (negative) units += 1n;
        break;
      case 'half-up':
        if (remainder * 2n >= quantum) units += 1n;
        break;
    }
  }

  const result = units * quantum;
  return negative ? -result : result;
}

export interface EffectivePriceInput {
  priceType: PriceType;
  /** fixed: fiat per unit. float: multiplier on the reference (1.02 = +2%). */
  price: Amount;
  /** Required for `float`, ignored for `fixed`. */
  referencePrice?: Amount | null;
}

/**
 * The price this trade actually executes at.
 *
 * Snapshotted onto the trade row by the caller, so a floating offer cannot
 * re-price a trade that is already in escrow. The buyer agreed to a number, and
 * the number they agreed to is the number they owe.
 */
export function effectivePrice(input: EffectivePriceInput): Amount {
  if (input.price <= 0n) throw new PricingError('Offer price must be positive', 'p2p.invalid_amount');

  if (input.priceType === 'fixed') return input.price;

  const reference = input.referencePrice;
  if (reference === undefined || reference === null || reference <= 0n) {
    throw new PricingError(
      'Floating offer has no reference price — refusing to take rather than invent one',
      'p2p.reference_price_unavailable',
    );
  }

  // half-up: the margin multiplier is symmetric, so neither side is
  // systematically favoured by the rounding of the price itself.
  const priced = mul(reference, input.price, 'half-up');
  if (priced <= 0n) {
    throw new PricingError('Floating price resolved to zero', 'p2p.reference_price_unavailable');
  }
  return priced;
}

export interface OfferBounds {
  minAmt: Amount;
  maxAmt: Amount;
  remainingAmt: Amount;
}

/**
 * Bounds check. Runs BEFORE any inventory is reserved and long before any
 * ledger post — §5: "taking an offer for more than its max, or less than its
 * min, is rejected before any lock."
 */
export function assertWithinBounds(amount: Amount, bounds: OfferBounds): void {
  if (amount <= 0n) throw new PricingError('Trade amount must be positive', 'p2p.invalid_amount');

  if (compare(amount, bounds.minAmt) < 0) {
    throw new PricingError(
      `Amount ${formatAmount(amount)} is below the offer minimum ${formatAmount(bounds.minAmt)}`,
      'p2p.amount_below_min',
    );
  }
  if (compare(amount, bounds.maxAmt) > 0) {
    throw new PricingError(
      `Amount ${formatAmount(amount)} is above the offer maximum ${formatAmount(bounds.maxAmt)}`,
      'p2p.amount_above_max',
    );
  }
  if (compare(amount, bounds.remainingAmt) > 0) {
    throw new PricingError(
      `Offer has ${formatAmount(bounds.remainingAmt)} remaining, ${formatAmount(amount)} requested`,
      'p2p.insufficient_offer_liquidity',
    );
  }
}

export interface QuoteInput {
  amount: Amount;
  priceType: PriceType;
  price: Amount;
  referencePrice?: Amount | null;
  fiatCurrency: string;
}

export interface Quote {
  readonly amount: Amount;
  readonly price: Amount;
  readonly fiatAmount: Amount;
}

/** Crypto amount + agreed price → the fiat obligation, quantised and final. */
export function quote(input: QuoteInput): Quote {
  if (!isSupportedFiat(input.fiatCurrency)) {
    throw new PricingError(`Fiat currency "${input.fiatCurrency}" is not enabled`, 'p2p.unsupported_fiat');
  }

  const price = effectivePrice(input);
  const raw = mul(input.amount, price, 'half-up');
  const fiatAmount = quantiseFiat(raw, input.fiatCurrency);

  if (fiatAmount <= 0n) {
    // A dust crypto amount at a low price can quantise to zero fiat. That is a
    // trade where the buyer owes nothing and the seller escrows something —
    // refuse it here rather than let it become a dispute nobody can adjudicate.
    throw new PricingError(`Trade rounds to zero ${input.fiatCurrency} — increase the amount`, 'p2p.invalid_amount');
  }

  return { amount: input.amount, price, fiatAmount };
}

/** Which party escrows, given the maker's side. The escrow owner is the seller. */
export function partiesFor(side: 'buy' | 'sell', makerId: string, takerId: string): { sellerId: string; buyerId: string } {
  // A `sell` offer means the MAKER sells crypto for fiat, so the maker escrows.
  // A `buy` offer means the maker buys crypto, so the TAKER is the seller and
  // the taker's balance is the one that gets locked.
  return side === 'sell' ? { sellerId: makerId, buyerId: takerId } : { sellerId: takerId, buyerId: makerId };
}
