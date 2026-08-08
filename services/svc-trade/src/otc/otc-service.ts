/**
 * OTC RFQ desk service (trade.otc Stage — D-S-02 Part A).
 *
 * Default desk law is unpublished → every quote/accept/settle refuses with
 * DIRECTION §8 residual. When owner publishes law, quotes disclose counterparty,
 * size, expiry, and spread; accept binds the quoted price (no last look);
 * settle posts only via ledger-client recipes.
 */

import { randomUUID } from 'node:crypto';
import { parseAmount, type Amount, type LedgerClient } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { otcSettleIdsFor } from '../spot/ids.js';
import { otcDeskLawStatusLine, requirePublishedOtcDeskLaw, type OtcDeskLaw, UNPUBLISHED_OTC_DESK_LAW } from './desk-law.js';
import { OTC_DESK_LAW_RESIDUAL, OtcError } from './errors.js';
import { NO_OTC_MIDS, otcPairKey, type OtcMidSource } from './mid-source.js';
import {
  acceptOtcQuote,
  buildOtcQuote,
  parseOtcMidPrice,
  presentBoundOtcFill,
  presentOtcQuote,
  type BoundOtcFill,
  type OtcQuote,
  type OtcSide,
} from './rfq.js';
import { planOtcSettle, postOtcSettle } from './settle.js';
import { assertOtcStakeGate, otcStakeGate } from './stake-gate.js';
import type { OtcStakeSource } from './stake-source.js';

export interface OtcDeskServiceOptions {
  law?: OtcDeskLaw;
  /** Platform counterparty id disclosed when law.counterparty === 'platform'. */
  platformCounterpartyId?: string;
  /** Server-side reference mid. Absent → every quote refuses (never the caller's number). */
  midSource?: OtcMidSource;
  now?: () => Date;
}

export class OtcDeskService {
  private readonly quotes = new Map<string, OtcQuote>();
  private readonly bounds = new Map<string, BoundOtcFill>();
  private readonly law: OtcDeskLaw;
  private readonly platformCounterpartyId: string;
  private readonly midSource: OtcMidSource;
  private readonly now: () => Date;

  constructor(
    private readonly ledger: LedgerClient,
    private readonly stakes: OtcStakeSource,
    options: OtcDeskServiceOptions = {},
  ) {
    this.law = options.law ?? UNPUBLISHED_OTC_DESK_LAW;
    this.platformCounterpartyId = options.platformCounterpartyId ?? 'platform:otc-desk';
    this.midSource = options.midSource ?? NO_OTC_MIDS;
    this.now = options.now ?? (() => new Date());
  }

  deskStatus() {
    return {
      published: this.law.published === true,
      statusLine: otcDeskLawStatusLine(this.law),
      residual: this.law.published === true ? null : OTC_DESK_LAW_RESIDUAL,
    };
  }

  async quote(
    principal: Principal,
    input: {
      side: OtcSide;
      baseAsset: string;
      quoteAsset: string;
      qty: string;
      /** Maker id when counterparty mode is maker. */
      makerId?: string;
    },
  ) {
    const law = requirePublishedOtcDeskLaw(this.law);
    const qty = parseAmount(input.qty);

    // Access gate before price lookup: an unstaked caller learns nothing about
    // what the desk can price, and a mid source that costs a round trip is not
    // spent on a caller who was never eligible.
    const stake = await this.stakes.stakeOf(principal.userId);
    assertOtcStakeGate(otcStakeGate({ stake, minStake: law.minStake }));

    // The desk's own mid. There is deliberately no caller-supplied fallback:
    // a taker who can name the price can name it at 1 and take the inventory.
    const baseAsset = input.baseAsset.trim();
    const quoteAsset = input.quoteAsset.trim();
    const pair = otcPairKey(baseAsset, quoteAsset);
    const sourced = await this.midSource(pair);
    if (sourced == null || String(sourced).trim() === '') {
      throw new OtcError(
        `No reference mid for ${pair} — the desk refuses rather than quote off a price it cannot source`,
        'trade.otc_no_reference_price',
      );
    }
    const midPrice = parseOtcMidPrice(String(sourced));

    let counterpartyId: string;
    if (law.counterparty === 'platform') {
      counterpartyId = this.platformCounterpartyId;
    } else {
      const makerId = (input.makerId ?? '').trim();
      if (!makerId) {
        throw new OtcError('Maker id required when desk routes to makers — refuse rather than invent', 'trade.otc_no_reference_price');
      }
      counterpartyId = makerId;
    }

    const quote = buildOtcQuote({
      quoteId: randomUUID(),
      userId: principal.userId,
      side: input.side,
      baseAsset,
      quoteAsset,
      qty,
      midPrice,
      spreadBps: law.spreadBps,
      counterparty: law.counterparty,
      counterpartyId,
      now: this.now(),
      quoteTtlMs: law.quoteTtlMs,
    });

    this.quotes.set(quote.quoteId, quote);
    return presentOtcQuote(quote);
  }

  async accept(
    principal: Principal,
    input: { quoteId: string; /** Optional — if set must equal quoted price (last-look guard). */ assertedPrice?: string },
  ) {
    requirePublishedOtcDeskLaw(this.law);
    const quote = this.quotes.get(input.quoteId);
    if (!quote) {
      throw new OtcError('OTC quote not found', 'trade.otc_quote_missing');
    }
    if (quote.userId !== principal.userId) {
      throw new OtcError('OTC quote belongs to another user', 'trade.otc_not_owner');
    }

    let asserted: Amount | null = null;
    if (input.assertedPrice != null && input.assertedPrice.trim() !== '') {
      asserted = parseAmount(input.assertedPrice);
    }

    const bound = acceptOtcQuote({ quote, now: this.now(), assertedPrice: asserted });
    this.bounds.set(bound.quoteId, bound);
    this.quotes.delete(quote.quoteId);
    return presentBoundOtcFill(bound);
  }

  /**
   * Settle a bound accept via ledger-client only.
   * Maker-routed mode refuses until owner publishes routing recipe.
   */
  async settle(principal: Principal, input: { quoteId: string }) {
    const law = requirePublishedOtcDeskLaw(this.law);
    const bound = this.bounds.get(input.quoteId);
    if (!bound) {
      throw new OtcError('OTC bound fill not found — accept first', 'trade.otc_quote_missing');
    }
    if (bound.userId !== principal.userId) {
      throw new OtcError('OTC fill belongs to another user', 'trade.otc_not_owner');
    }

    // Derived from the quote, never minted: a retry after a partial post must
    // compute the same keys and find the ledger's original transaction.
    const { takerOrderId, makerOrderId, fillId } = otcSettleIdsFor(bound.quoteId);
    const plan = planOtcSettle({
      law,
      bound,
      takerOrderId,
      makerOrderId,
      fillId,
    });
    await postOtcSettle(this.ledger, plan);
    this.bounds.delete(bound.quoteId);
    return {
      fillId,
      takerOrderId,
      makerOrderId,
      ...presentBoundOtcFill(bound),
    };
  }
}
