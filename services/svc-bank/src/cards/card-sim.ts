import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { CARD_CHANNELS, type CardChannel } from './authorization.js';
import {
  type CardControls,
  type CardControlsResult,
  type CardFundRequest,
  type CardFundResult,
  type CardIssuerAdapter,
  type CardIssuerCapability,
  type CardIssuerEvent,
  type CardIssuerHealth,
  type CardIssueRequest,
  type CardIssueResult,
  type CardWebhookRequest,
} from './issuer-adapter.js';
import { signCardPayload, verifyCardSignature } from './webhook-signature.js';

/**
 * card-sim — §8.1's v1 adapter: _"`card-sim` adapter completing the full flow"_.
 *
 * It is a mock ISSUER, not a mock adapter, and the distinction is the whole
 * value of it. Everything on this side of the interface is real: the card
 * lifecycle, the control push, the signed webhooks, the replay window, the
 * decline codes. Only the counterparty is simulated. When a licensed issuer
 * relationship lands, the core it plugs into has already run the full lifecycle
 * thousands of times in CI and the only new thing is HTTP.
 *
 * It is also the reference for whoever writes the second adapter: an issuer
 * that behaves like this file will work against the core unchanged, which is
 * the §18 "issuer risk is a swappable module" claim in practice.
 *
 * NOTE ON `fund`. This adapter does NOT declare the `fund` capability, and that
 * is a statement about the design rather than a gap: §18's card has nothing to
 * fund, because the hold is placed at the swipe and the issuer never holds a
 * balance. `fund` is implemented so the interface is total, and it refuses.
 */

export interface CardSimOptions {
  /** Webhook signing secret. Config in dev; a vault reference in prod. */
  readonly secret: string;
  /** Injectable clock, so replay windows are testable without waiting. */
  readonly now?: () => Date;
  readonly toleranceSeconds?: number;
}

/** Holder references that steer the sim, the way a real sandbox uses test PANs. */
export const SIM_ISSUE_DECLINE_REF = 'holder_issue_decline';

interface SimCard {
  issuerCardRef: string;
  cardId: string;
  controls: CardControls;
}

export class CardSimAdapter implements CardIssuerAdapter {
  readonly id = 'card-sim';
  readonly capabilities: readonly CardIssuerCapability[] = ['issue', 'controls', 'webhook'];

  /** The mock issuer's records. A real adapter holds no state; this one IS the counterparty. */
  private readonly cards = new Map<string, SimCard>();
  private readonly now: () => Date;
  private readonly toleranceSeconds: number;
  private lastContact: Date;
  private up = true;
  private sequence = 0;

  constructor(private readonly options: CardSimOptions) {
    this.now = options.now ?? (() => new Date());
    this.toleranceSeconds = options.toleranceSeconds ?? 300;
    this.lastContact = this.now();
  }

  health(): CardIssuerHealth {
    return {
      healthy: this.up,
      latencyMs: 9,
      lastUpdate: this.lastContact,
      ...(this.up ? {} : { reason: 'sim issuer marked down' }),
    };
  }

  /** Test hook: take the issuer offline to exercise the degraded path. */
  setDown(down: boolean): void {
    this.up = !down;
    this.lastContact = this.now();
  }

  async issue(request: CardIssueRequest): Promise<CardIssueResult> {
    this.lastContact = this.now();

    if (request.holderRef === SIM_ISSUE_DECLINE_REF) {
      return {
        ok: false,
        issuerCardRef: '',
        failureCode: 'issuer.declined',
        failureReason: 'The issuer declined this application',
      };
    }

    this.sequence += 1;
    const issuerCardRef = `sim_card_${this.sequence.toString().padStart(6, '0')}`;
    this.cards.set(issuerCardRef, {
      issuerCardRef,
      cardId: request.cardId,
      controls: { frozen: false, atmEnabled: true, onlineEnabled: true, crossBorderEnabled: true },
    });

    // Deterministic and fake. Four digits derived from the sequence, never from
    // a PAN — this service has no column a real one could be written to.
    return { ok: true, issuerCardRef, lastFour: (4000 + (this.sequence % 1000)).toString().slice(-4) };
  }

  async fund(request: CardFundRequest): Promise<CardFundResult> {
    this.lastContact = this.now();
    // See the class comment: §18's card is not pre-funded, and an adapter that
    // silently accepted a funding push would let a float re-appear by accident.
    return {
      ok: false,
      issuerRef: request.fundingId,
      amount: request.amount,
      failureCode: 'issuer.capability_unsupported',
      failureReason: 'card-sim runs just-in-time authorisation — there is no balance to fund (§18)',
    };
  }

  async controls(issuerCardRef: string, controls: CardControls): Promise<CardControlsResult> {
    this.lastContact = this.now();
    const card = this.cards.get(issuerCardRef);
    if (!card) {
      return {
        ok: false,
        issuerCardRef,
        applied: controls,
        failureCode: 'issuer.card_unknown',
        failureReason: `No card ${issuerCardRef} at this issuer`,
      };
    }
    card.controls = { ...controls };
    return { ok: true, issuerCardRef, applied: card.controls };
  }

  /**
   * Build a signed delivery, exactly as the issuer would send it.
   *
   * Exported behaviour rather than test-only glue: it is what proves the
   * verifier accepts a genuine delivery, and a verifier only ever tested
   * against forgeries is one that could be rejecting everything.
   */
  signedDelivery(event: Omit<CardIssuerEvent, 'issuerId'> & { amount: Amount }): CardWebhookRequest {
    const timestamp = Math.floor(this.now().getTime() / 1000).toString();
    const body = JSON.stringify({
      eventId: event.eventId,
      type: event.type,
      issuerCardRef: event.issuerCardRef,
      issuerAuthRef: event.issuerAuthRef,
      // Decimal string on the wire. Never a number — JSON cannot hold a bigint
      // and `Number(amount)` would round a large one away silently.
      amount: formatAmount(event.amount),
      assetId: event.assetId,
      channel: event.channel,
      crossBorder: event.crossBorder,
      merchantName: event.merchantName,
      merchantCategoryCode: event.merchantCategoryCode,
      occurredAt: event.occurredAt.toISOString(),
    });

    return {
      headers: {
        'x-card-sim-signature': signCardPayload(this.options.secret, timestamp, body),
        'x-card-sim-timestamp': timestamp,
      },
      body,
    };
  }

  verifyWebhook(request: CardWebhookRequest): CardIssuerEvent | null {
    const ok = verifyCardSignature({
      body: request.body,
      signature: request.headers['x-card-sim-signature'],
      timestamp: request.headers['x-card-sim-timestamp'],
      secret: this.options.secret,
      toleranceSeconds: this.toleranceSeconds,
      now: this.now(),
    });
    if (!ok) return null;

    // Signature verified, so the bytes are ours. The CONTENT is still not
    // trusted: a valid signature over a malformed body is a bug at the issuer,
    // and it must produce null rather than an event with NaN in it.
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(request.body) as Record<string, unknown>;
    } catch {
      return null;
    }

    const type = parsed.type;
    if (type !== 'authorization' && type !== 'capture' && type !== 'reversal' && type !== 'refund') return null;

    const channel = parsed.channel;
    if (typeof channel !== 'string' || !(CARD_CHANNELS as readonly string[]).includes(channel)) return null;

    const eventId = parsed.eventId;
    const issuerCardRef = parsed.issuerCardRef;
    const issuerAuthRef = parsed.issuerAuthRef;
    const assetId = parsed.assetId;
    const amountRaw = parsed.amount;
    const occurredAtRaw = parsed.occurredAt;

    if (
      typeof eventId !== 'string' ||
      typeof issuerCardRef !== 'string' ||
      typeof issuerAuthRef !== 'string' ||
      typeof assetId !== 'string' ||
      typeof amountRaw !== 'string' ||
      typeof occurredAtRaw !== 'string'
    ) {
      return null;
    }

    let amount: Amount;
    try {
      amount = parseAmount(amountRaw);
    } catch {
      return null;
    }

    const occurredAt = new Date(occurredAtRaw);
    if (Number.isNaN(occurredAt.getTime())) return null;

    this.lastContact = this.now();

    return {
      issuerId: this.id,
      eventId,
      type,
      issuerCardRef,
      issuerAuthRef,
      amount,
      assetId,
      channel: channel as CardChannel,
      crossBorder: parsed.crossBorder === true,
      ...(typeof parsed.merchantName === 'string' ? { merchantName: parsed.merchantName } : {}),
      ...(typeof parsed.merchantCategoryCode === 'string' ? { merchantCategoryCode: parsed.merchantCategoryCode } : {}),
      occurredAt,
    };
  }
}
