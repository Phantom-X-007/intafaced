import type { Amount } from '@intafaced/ledger-client';
import type { CardChannel } from './authorization.js';

/**
 * CardIssuerAdapter — the §8.1 interface, and the §18 "issuer risk is a
 * swappable module" claim made testable.
 *
 * §8.1, verbatim: _"`CardIssuerAdapter` interface (issue, fund,
 * authorize-webhook, controls). v1 ships `card-sim` adapter completing the full
 * flow: auth webhook → real-time ledger check → crypto-to-fiat convert at spend
 * via Convert → approve/decline < 2s budget → cashback recipe in IFC."_
 *
 * ── WHY THIS INTERFACE IS THE PRODUCT ───────────────────────────────────────
 *
 * Every "no-KYC" card on the market is a programme manager sitting on top of a
 * licensed issuer's BIN, and the programme manager's entire commercial risk is
 * that the issuer changes their mind — about limits, about verification, about
 * whether the programme continues at all. Doctrine §0.4 is the answer: the
 * partner sits behind an internal interface and "the platform never depends on
 * them to function". §18 says the same thing in product terms — the issuer is
 * swappable, the funding design is ours and permanent.
 *
 * That is only true if the core never learns which issuer it is talking to. It
 * asks what an adapter CAN do (`capabilities`) rather than who it is, exactly
 * as `RailAdapter` does in svc-pay and `LiquiditySource` does in
 * packages/venue-adapter. Adding an issuer is: construct it, register it.
 *
 * MONEY IS `Amount` — a scaled bigint — throughout. An issuer that speaks minor
 * units or decimal strings converts at its own boundary and never lets a
 * `number` past it.
 */

export const CARD_ISSUER_CAPABILITIES = [
  /** Create a card on the issuer's programme. */
  'issue',
  /**
   * Push value to a prepaid programme that requires a pre-funded balance.
   *
   * Deliberately a CAPABILITY rather than a required call. §18's design has
   * nothing to fund — the hold is placed at the swipe and the issuer never
   * holds a balance, which is what makes "a programme shutdown strands zero
   * user funds" true. An issuer whose programme insists on a float declares
   * this; one that supports just-in-time authorisation does not.
   */
  'fund',
  /** Freeze, unfreeze, and channel locks pushed to the issuer. */
  'controls',
  /** Signed inbound events: authorisations, captures, reversals, refunds. */
  'webhook',
] as const;
export type CardIssuerCapability = (typeof CARD_ISSUER_CAPABILITIES)[number];

export interface CardIssuerHealth {
  readonly healthy: boolean;
  readonly latencyMs: number;
  readonly lastUpdate: Date;
  readonly reason?: string;
}

export interface CardIssueRequest {
  /** Our card id. The issuer echoes it so a webhook can be matched back. */
  readonly cardId: string;
  /** Opaque to the issuer — never a name, never a document. */
  readonly holderRef: string;
  /** The issuer's own programme identifier, from the programme row. */
  readonly programmeRef: string;
  readonly assetId: string;
  readonly form: 'virtual' | 'physical';
}

export interface CardIssueResult {
  readonly ok: boolean;
  /** The issuer's reference for the card. Stable for its whole life. */
  readonly issuerCardRef: string;
  /**
   * Last four digits, for the UI. Never a PAN, never a CVV, never an expiry —
   * this service is deliberately out of PCI scope and stays that way by not
   * having a column those could be written to.
   */
  readonly lastFour?: string;
  readonly failureCode?: string;
  readonly failureReason?: string;
}

export interface CardFundRequest {
  readonly fundingId: string;
  readonly issuerCardRef: string;
  readonly amount: Amount;
  readonly assetId: string;
}

export interface CardFundResult {
  readonly ok: boolean;
  readonly issuerRef: string;
  readonly amount: Amount;
  readonly failureCode?: string;
  readonly failureReason?: string;
}

/** What the user (or an operator) has locked. Pushed to the issuer, not just stored. */
export interface CardControls {
  readonly frozen: boolean;
  readonly atmEnabled: boolean;
  readonly onlineEnabled: boolean;
  readonly crossBorderEnabled: boolean;
}

export interface CardControlsResult {
  readonly ok: boolean;
  readonly issuerCardRef: string;
  readonly applied: CardControls;
  readonly failureCode?: string;
  readonly failureReason?: string;
}

export interface CardWebhookRequest {
  /** Lower-cased header names. */
  readonly headers: Readonly<Record<string, string>>;
  /**
   * The RAW body, not parsed JSON. A signature covers bytes; parsing and
   * re-serialising changes key order and whitespace, and the check then fails
   * for honest deliveries — or gets quietly relaxed until it passes.
   */
  readonly body: string;
}

export type CardEventType = 'authorization' | 'capture' | 'reversal' | 'refund';

/**
 * An event from the issuer.
 *
 * `authorization` is the one with a deadline: the issuer is asking, and §20
 * gives us under two seconds to answer. The other three are notifications of
 * something that already happened, and they are idempotent by `eventId`.
 */
export interface CardIssuerEvent {
  readonly issuerId: string;
  /** The issuer's event id. THE dedupe key — a redelivery repeats it. */
  readonly eventId: string;
  readonly type: CardEventType;
  readonly issuerCardRef: string;
  /** The issuer's authorisation reference, tying a capture back to its auth. */
  readonly issuerAuthRef: string;
  readonly amount: Amount;
  readonly assetId: string;
  readonly channel: CardChannel;
  readonly crossBorder: boolean;
  readonly merchantName?: string;
  /** ISO 18245 merchant category code, as the scheme sent it. */
  readonly merchantCategoryCode?: string;
  readonly occurredAt: Date;
}

/** THE INTERFACE (§8.1). */
export interface CardIssuerAdapter {
  readonly id: string;
  readonly capabilities: readonly CardIssuerCapability[];

  health(): CardIssuerHealth;

  issue(request: CardIssueRequest): Promise<CardIssueResult>;
  fund(request: CardFundRequest): Promise<CardFundResult>;
  controls(issuerCardRef: string, controls: CardControls): Promise<CardControlsResult>;

  /**
   * Verify and parse an inbound webhook.
   *
   * Returns null for anything that does not verify — bad signature, missing
   * header, replayed timestamp, unparseable body. NEVER throws: this endpoint
   * is reachable by anyone on the internet, and one that throws on garbage is a
   * denial-of-service surface with a public address.
   *
   * MUST compare signatures in constant time. A forged webhook here says "this
   * was captured" about money that never moved.
   */
  verifyWebhook(request: CardWebhookRequest): CardIssuerEvent | null;
}

export function supportsCapability(adapter: CardIssuerAdapter, capability: CardIssuerCapability): boolean {
  return adapter.capabilities.includes(capability);
}

export class UnknownCardIssuerError extends Error {
  readonly code = 'bank.card_issuer_unknown';
  constructor(issuerId: string, known: readonly string[]) {
    super(`No card issuer adapter "${issuerId}". Registered: ${known.join(', ') || '(none)'}`);
    this.name = 'UnknownCardIssuerError';
  }
}

export class CardIssuerCapabilityError extends Error {
  readonly code = 'bank.card_issuer_capability';
  constructor(issuerId: string, capability: CardIssuerCapability) {
    super(`Card issuer "${issuerId}" does not support ${capability}`);
    this.name = 'CardIssuerCapabilityError';
  }
}

/**
 * The registry the core resolves issuers through.
 *
 * Deliberately dumb, for the same reason `RailRegistry` is: it maps an id to an
 * adapter and answers capability questions. Choosing BETWEEN issuers — by
 * region, by programme, by which one is still answering — is the programme
 * row's job, and putting any of it here would be the start of a core that knows
 * whose BIN it is running on.
 */
export class CardIssuerRegistry {
  private readonly byId: ReadonlyMap<string, CardIssuerAdapter>;

  constructor(adapters: readonly CardIssuerAdapter[]) {
    const map = new Map<string, CardIssuerAdapter>();
    for (const adapter of adapters) {
      if (map.has(adapter.id)) {
        // Two adapters on one id means `cards.issuer_id` no longer identifies
        // which issuer settles a given card — and that column is what the
        // ledger boundary account is derived from.
        throw new Error(`Duplicate card issuer adapter id "${adapter.id}"`);
      }
      map.set(adapter.id, adapter);
    }
    this.byId = map;
  }

  ids(): string[] {
    return [...this.byId.keys()];
  }

  list(): CardIssuerAdapter[] {
    return [...this.byId.values()];
  }

  has(issuerId: string): boolean {
    return this.byId.has(issuerId);
  }

  get(issuerId: string): CardIssuerAdapter {
    const adapter = this.byId.get(issuerId);
    if (!adapter) throw new UnknownCardIssuerError(issuerId, this.ids());
    return adapter;
  }

  /**
   * Resolve an issuer and assert it can do what is about to be asked of it.
   *
   * Checked at the call site rather than discovered halfway through, because
   * halfway through on this path is after the ledger has already moved.
   */
  require(issuerId: string, capability: CardIssuerCapability): CardIssuerAdapter {
    const adapter = this.get(issuerId);
    if (!supportsCapability(adapter, capability)) throw new CardIssuerCapabilityError(issuerId, capability);
    return adapter;
  }
}
