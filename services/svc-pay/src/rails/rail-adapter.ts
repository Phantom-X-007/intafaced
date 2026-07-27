import type { Amount } from '@intafaced/ledger-client';

/**
 * RailAdapter — the §6.1 adapter interface.
 *
 * Doctrine §0.4: "Adapters, not integrations. All external rails (card issuers,
 * PSP partners, bank rails, liquidity venues) sit behind internal interfaces…
 * the platform never depends on them to function." Every partner rail named in
 * §6.1 plugs in later as an adapter; none of them is named here, because a
 * partner's name has no place in the code that would have to survive them.
 *
 * §6.1 states the claim this file has to make true: every partner rail — card
 * acquiring, PSP, bank — "drops in later as an adapter with zero core changes".
 * That is a testable claim, not a hope, and `conformance.ts` is what tests it —
 * a new adapter passes the kit or it does not merge (§6.3).
 *
 * The shape mirrors `packages/venue-adapter/src/source.ts`, which is how this
 * repo already does adapters: an interface, capability flags, health, and every
 * implementation behind it. The core asks what an adapter can do rather than
 * knowing which adapter it is talking to — that is the entire mechanism by
 * which a new rail costs zero core changes.
 *
 * MONEY IS `Amount` — a scaled bigint — everywhere in this file. A rail that
 * speaks decimal strings or minor units converts at its own boundary, on the
 * way in and on the way out, and never lets a `number` past it.
 */

/** §6.1: `capabilities: RailCapability[]`. */
export const RAIL_CAPABILITIES = ['authorize', 'capture', 'refund', 'payout', 'webhook'] as const;
export type RailCapability = (typeof RAIL_CAPABILITIES)[number];

/**
 * Health, in the shape `LiquiditySource` uses.
 *
 * `lastUpdate` matters for the same reason it does for a venue: a rail that has
 * stopped responding but still answers is worse than one that is plainly down,
 * because the router keeps sending it traffic.
 */
export interface RailHealth {
  readonly healthy: boolean;
  /** Round-trip latency in ms. Ties break on it, and degradation shows in it. */
  readonly latencyMs: number;
  readonly lastUpdate: Date;
  readonly reason?: string;
}

/** What the payer is paying with. Rails read only the parts they understand. */
export interface PaymentInstrument {
  /** 'card' | 'crypto' | 'bank_transfer' — the family, not the brand. */
  readonly kind: string;
  /** Tokenised card / stored instrument reference. Never a PAN. */
  readonly token?: string;
  /** On-chain address the payer will send from, when the rail knows it. */
  readonly address?: string;
}

/** §6.1: `authorize(p: PaymentIntent)`. */
export interface PaymentIntent {
  /** Our payment id. The rail echoes it back so a webhook can be matched. */
  readonly paymentId: string;
  readonly merchantId: string;
  /** Scaled bigint. Never a number, never a float, never minor units. */
  readonly amount: Amount;
  /** Asset id as the ledger knows it: 'USDT', 'BTC', 'EUR'. */
  readonly assetId: string;
  readonly method: string;
  readonly instrument?: PaymentInstrument;
  /** Merchant's reference for the buyer — opaque to us and to the rail. */
  readonly customerRef?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** §6.1: `payout(s: SettlementInstruction)`. */
export interface SettlementInstruction {
  readonly settlementId: string;
  readonly merchantId: string;
  /** Net owed to the merchant for the window. Scaled bigint. */
  readonly amount: Amount;
  readonly assetId: string;
  readonly window: string;
  readonly destination: PayoutDestination;
}

export interface PayoutDestination {
  /** 'crypto' | 'bank'. */
  readonly kind: string;
  /** Address or masked account reference. */
  readonly ref: string;
}

export type RailResultStatus = 'pending' | 'authorized' | 'captured' | 'refunded' | 'paid_out' | 'failed';

/**
 * §6.1: `RailResult`.
 *
 * `ok` and `status` are not redundant: `ok === (status !== 'failed')` is an
 * invariant the conformance kit asserts on every adapter, so a caller can
 * branch on either and be certain the other agrees. An adapter that returns
 * `ok: true` with a failure status has a bug the kit catches before merge —
 * and that particular bug quietly books money that never moved.
 *
 * A rail declining is a RESULT, not an exception. Declines are ordinary
 * traffic; throwing for them makes the ordinary path the exceptional one and
 * loses the decline code the merchant needs.
 */
export interface RailResult {
  readonly ok: boolean;
  /** The rail's own reference. Stable across authorize → capture → refund. */
  readonly railRef: string;
  readonly status: RailResultStatus;
  /** What the rail actually moved. Scaled bigint. */
  readonly amount: Amount;
  readonly assetId: string;
  readonly at: Date;
  /** Machine-readable, e.g. 'card.declined', 'chain.insufficient_confirmations'. */
  readonly failureCode?: string;
  readonly failureReason?: string;
  /** The rail's untranslated response, for support and reconciliation. */
  readonly raw?: Readonly<Record<string, unknown>>;
}

/**
 * A webhook exactly as it arrived.
 *
 * `body` is the RAW body, not parsed JSON, and that is not a convenience: a
 * signature covers the bytes that were sent. Parsing and re-serialising before
 * verifying changes key order and whitespace, and the signature check then
 * fails for honest deliveries — or, worse, is quietly relaxed until it passes.
 */
export interface RailWebhookRequest {
  /** Lower-cased header names. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export type RailEventType = 'authorized' | 'captured' | 'refunded' | 'failed' | 'payout.completed';

/** §6.1: `verifyWebhook(req): RailEvent | null`. */
export interface RailEvent {
  readonly railId: string;
  /** The rail's own event id. THE dedupe key — a redelivery repeats it. */
  readonly eventId: string;
  readonly type: RailEventType;
  readonly railRef: string;
  readonly amount?: Amount;
  readonly assetId?: string;
  readonly occurredAt: Date;
  readonly failureCode?: string;
}

/**
 * THE INTERFACE (§6.1, verbatim in shape).
 *
 * ```ts
 * interface RailAdapter {
 *   id: string;
 *   capabilities: RailCapability[];
 *   authorize(p: PaymentIntent): Promise<RailResult>;
 *   capture(ref: string): Promise<RailResult>;
 *   refund(ref: string, amount: Amount): Promise<RailResult>;
 *   payout(s: SettlementInstruction): Promise<RailResult>;
 *   verifyWebhook(req): RailEvent | null;
 * }
 * ```
 *
 * `health()` is the one addition, taken from `LiquiditySource` — routing and
 * the operator console both need to know whether a rail is answering, and an
 * adapter that cannot say is one the core has to guess about.
 *
 * Note what `capture` takes: a reference, and nothing else. Partial capture is
 * not expressible through this interface, so the core refuses it rather than
 * pretending — changing that is a change to this file, reviewed on its own.
 */
export interface RailAdapter {
  readonly id: string;
  readonly capabilities: readonly RailCapability[];

  health(): RailHealth;

  authorize(p: PaymentIntent): Promise<RailResult>;
  capture(ref: string): Promise<RailResult>;
  refund(ref: string, amount: Amount): Promise<RailResult>;
  payout(s: SettlementInstruction): Promise<RailResult>;

  /**
   * Verify and parse an inbound webhook.
   *
   * Returns null for anything that does not verify — a bad signature, a missing
   * header, a replayed timestamp, a body that does not parse. Never throws for
   * malformed input, because a webhook endpoint that throws on garbage is a
   * denial-of-service surface anyone on the internet can reach.
   *
   * MUST be constant-time in the signature comparison (`crypto.timingSafeEqual`).
   * A timing side channel on a signature check is a real attack: an attacker who
   * can measure it can forge a webhook byte by byte, and a forged webhook here
   * says "this payment was captured" about money that never moved.
   */
  verifyWebhook(req: RailWebhookRequest): RailEvent | null;
}

export function supports(adapter: RailAdapter, capability: RailCapability): boolean {
  return adapter.capabilities.includes(capability);
}

/**
 * A rail is usable only when it is healthy AND its health is fresh.
 *
 * Same failure as a stale venue quote (`isRoutable` in venue-adapter): an
 * adapter whose health was last confirmed ten minutes ago is not "healthy", it
 * is "unknown", and routing traffic to unknown is how a payment sits in
 * `created` while a merchant watches a spinner.
 */
export function isUsable(adapter: RailAdapter, now: Date = new Date(), maxStalenessMs = 30_000): boolean {
  const health = adapter.health();
  if (!health.healthy) return false;
  return now.getTime() - health.lastUpdate.getTime() <= maxStalenessMs;
}

/** A failed result, in one place, so every adapter shapes declines identically. */
export function railFailure(input: {
  railRef: string;
  amount: Amount;
  assetId: string;
  failureCode: string;
  failureReason: string;
  at?: Date;
  raw?: Readonly<Record<string, unknown>>;
}): RailResult {
  return {
    ok: false,
    railRef: input.railRef,
    status: 'failed',
    amount: input.amount,
    assetId: input.assetId,
    at: input.at ?? new Date(),
    failureCode: input.failureCode,
    failureReason: input.failureReason,
    raw: input.raw,
  };
}
