import type { Amount } from '@intafaced/ledger-client/money';

/**
 * ACCOUNT STATE AT AN EXTERNAL VENUE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * READ THIS BEFORE USING ANY TYPE IN THIS FILE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **A `VenueBalance` is not a balance.** Doctrine §0.6: no module holds its own
 * balance, and value moves only through `packages/ledger-client`. Nothing here
 * is an exception to that, and nothing here may be used as though it were.
 *
 * What these types describe is an OBSERVATION of somebody else's records — a
 * report of what a third party says it is holding, at a moment, over a network
 * that may be lying by omission. The distinction is not pedantic:
 *
 *   · A ledger balance is authoritative. It is the result of double-entry posts
 *     we made and can replay. Two reads agree because there is one truth.
 *   · A venue balance is a rumour with a timestamp. It is stale the instant it
 *     arrives, it moves when anyone else with a key trades, and the venue is
 *     free to be wrong.
 *
 * Which is why every type in this file carries `observedAt` and none of them is
 * ever the input to a ledger post. A transfer between venues debits the ledger
 * against a *recipe*, and the venue's own report is at most a reconciliation
 * signal — the thing you alert on when it disagrees, never the thing you
 * believe. Writing `ledger.credit(venueBalance.free)` would move platform money
 * on the strength of a JSON response from a company we do not control.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CREDENTIALS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nothing in this file can be read without an API key, and §27 puts those in the
 * Venue Vault: per-user, HSM-backed, scoped, **withdrawal permission refused by
 * policy**. Until the vault exists and the owner has issued keys, every
 * `AccountAdapter` throws `VenueCredentialsMissingError`. See `errors.ts` for
 * why that is loud rather than an empty array.
 */

export interface VenueBalance {
  readonly venueId: string;
  readonly asset: string;
  /** Available to trade with. */
  readonly free: Amount;
  /** Committed to resting orders or margin. */
  readonly used: Amount;
  /**
   * `free + used`, as the venue reports it.
   *
   * Carried rather than derived, because a venue whose own total disagrees with
   * its own parts is a venue mid-incident, and that is worth detecting. Deriving
   * it would erase the evidence.
   */
  readonly total: Amount;
  /** When THIS PROCESS read it. Non-negotiable — see the header. */
  readonly observedAt: Date;
}

export interface VenuePosition {
  readonly venueId: string;
  readonly symbol: string;
  readonly side: 'long' | 'short';
  /** Size in base units, always positive; direction lives in `side`. */
  readonly size: Amount;
  readonly entryPrice: Amount;
  readonly markPrice: Amount | null;
  /** Signed. Negative is a loss. */
  readonly unrealisedPnl: Amount | null;
  /** Basis points of 1x — `10_000` is 1x. See `VenueLimits.maxLeverageBps`. */
  readonly leverageBps: number | null;
  /**
   * `null` where the venue publishes none — which is not the same as "far away".
   * A risk check that read a missing liquidation price as zero would conclude
   * the position is infinitely safe.
   */
  readonly liquidationPrice: Amount | null;
  readonly observedAt: Date;
}

/**
 * Order lifecycle, normalised.
 *
 * `pending` and `open` are separate because the gap between them is where
 * duplicate orders are born: an order that has been accepted by our process but
 * not yet acknowledged by the venue is in a state where a retry, a reconnect or
 * a redeploy can place it twice. `clientOrderId` is what closes that hole — see
 * `PlaceOrderRequest`.
 */
export type VenueOrderStatus =
  /** Sent, not yet acknowledged. May or may not exist at the venue. */
  'pending' | 'open' | 'partially_filled' | 'filled' | 'canceled' | 'rejected' | 'expired';

export type VenueOrderType = 'limit' | 'market';

export interface VenueOrder {
  readonly venueId: string;
  /** The venue's id. `null` while `pending` — that is the point of `pending`. */
  readonly venueOrderId: string | null;
  /** Ours. The idempotency key. Always present, on every order, from the start. */
  readonly clientOrderId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly type: VenueOrderType;
  /** `null` on a market order. */
  readonly price: Amount | null;
  readonly amount: Amount;
  readonly filled: Amount;
  readonly remaining: Amount;
  /** `null` until something fills. Zero would read as "filled at zero". */
  readonly averagePrice: Amount | null;
  readonly status: VenueOrderStatus;
  readonly feePaid: Amount | null;
  readonly feeAsset: string | null;
  readonly createdAt: Date;
  readonly observedAt: Date;
}

/**
 * A route by which an asset can move from one venue to another.
 *
 * §27 calls these "transfer rails between venues". They are the least glamorous
 * and most expensive part of cross-venue execution: an arbitrage that ignores
 * `estimatedSeconds` is an arbitrage that has already closed by the time the
 * inventory arrives, which is why §28 specifies pre-positioned inventory both
 * sides rather than bridging on the trade.
 */
export interface TransferRail {
  readonly fromVenueId: string;
  readonly toVenueId: string;
  readonly asset: string;
  /** Chain or rail identifier — the two ends must agree on it or funds are lost. */
  readonly network: string;
  readonly minAmount: Amount;
  /** Charged by the sending venue, in the asset being moved. */
  readonly fee: Amount;
  /** Observed, not advertised. Venues quote optimistically. */
  readonly estimatedSeconds: number;
  /**
   * False when either end has withdrawals or deposits suspended.
   *
   * Suspension is common, unannounced, and asymmetric — a venue may take
   * deposits while refusing withdrawals for days. A rail assumed open because it
   * was open yesterday is how inventory ends up stranded on the wrong side.
   */
  readonly enabled: boolean;
  readonly observedAt: Date;
}
