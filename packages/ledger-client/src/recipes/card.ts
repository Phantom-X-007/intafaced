import type { Amount } from '../money.js';
import type { AccountRef, EntryInput, PostRequest } from '../types.js';
import { InvalidEntryError } from '../types.js';
import { cardAuthHoldAccount, cardIssuerBoundary, userAvailable } from '../accounts.js';

/**
 * CARD RECIPES (§8.1 cards, §18 the sovereign card).
 *
 * ⚠ SHARED-PACKAGE CHANGE — flagged deliberately, same as `./bank.ts`.
 *
 * §15.2 wants a `packages/ledger-client` change as its own PR ahead of the
 * service that uses it. These four arrive with svc-bank's card surface because
 * a card authorisation is a value movement no existing recipe expresses, and
 * assembling the entries inline in svc-bank is the one thing AGENT_PROTOCOL §2
 * refuses outright. They are in their own file so the shared-package diff is
 * reviewable — and revertable — on its own.
 *
 * ── THE SHAPE, AND WHY IT IS THE WITHDRAWAL SHAPE ───────────────────────────
 *
 * A card authorisation is a withdrawal that has not happened yet. The scheme
 * asks "will you honour this?", we answer in under two seconds (§20), and then
 * a capture arrives minutes or days later for an amount that may be lower than
 * the one we approved. That is exactly `withdrawHold` → `withdrawSettle` /
 * `withdrawReverse`, and these recipes are deliberately the same three-step
 * shape rather than a new one:
 *
 *   authHold   available → hold           (we have promised this money)
 *   capture    hold      → issuer boundary (the scheme took it)
 *   release    hold      → available       (it did not, or not all of it)
 *   refund     issuer boundary → available (the merchant sent it back)
 *
 * ── WHAT IS NOT HERE ────────────────────────────────────────────────────────
 *
 * There is no recipe for funding a card, because a card is not funded. The
 * balance behind it is the user's ordinary `available` balance and the hold is
 * placed at the moment of the swipe — which is what makes "a programme shutdown
 * strands zero user funds" (§18) true on this plane as well as on the protocol
 * one. A recipe that moved value into a card-shaped pot would be re-creating
 * the float that §18 exists to abolish.
 *
 * There is no cashback recipe either. §18's "cashback in IFC" is `rewardPay`,
 * which already exists and already pays from the rewards engine.
 */

const debit = (account: AccountRef, amount: Amount): EntryInput => ({ account, direction: 'debit', amount });
const credit = (account: AccountRef, amount: Amount): EntryInput => ({ account, direction: 'credit', amount });

function requirePositive(name: string, value: Amount): void {
  if (value <= 0n) throw new InvalidEntryError(`${name} must be positive`);
}

export interface CardAuthorizationInput {
  /**
   * OUR id for this authorisation, not the scheme's.
   *
   * It is the business key for every posting in the authorisation's life, so it
   * has to be something we mint and can reproduce. Scheme references are not
   * unique across issuers and are occasionally reused, and an idempotency key
   * that collides across two users is the worst bug on this path.
   */
  authorizationId: string;
  userId: string;
  assetId: string;
  amount: Amount;
  /** Which issuer programme this card runs on — decides the boundary account. */
  issuerId: string;
}

/**
 * Step 1: the swipe. Value leaves `available` and sits in this authorisation's
 * own hold while the scheme decides what it actually wants.
 *
 * Posting this BEFORE answering the scheme is the whole design. An approval
 * sent first and reserved afterwards is an approval we cannot honour if the
 * user spends the same balance in the intervening milliseconds — and on a card
 * network there is no way to un-approve.
 */
export function cardAuthHold(input: CardAuthorizationInput): PostRequest {
  requirePositive('card authorization amount', input.amount);
  return {
    idempotencyKey: `bank.card.auth:${input.authorizationId}`,
    module: 'bank',
    reason: 'card.authorized',
    meta: { authorizationId: input.authorizationId, issuerId: input.issuerId },
    entries: [
      credit(userAvailable(input.userId, input.assetId), input.amount),
      debit(cardAuthHoldAccount(input.userId, input.assetId, input.authorizationId), input.amount),
    ],
  };
}

export interface CardCaptureInput extends CardAuthorizationInput {
  /**
   * Business key for THIS capture. One authorisation can be captured more than
   * once — a bar tab, a split shipment — so the authorisation id alone is not
   * unique enough to key a posting on.
   */
  captureId: string;
}

/**
 * Step 2a: the scheme captured. Value leaves the book towards the issuer.
 *
 * Draws on THIS authorisation's hold, never on the user's shared hold: the
 * mistake `withdrawSettle` had before P0-3 was consuming value some other
 * reservation was relying on, with balanced books and no record of the theft.
 *
 * `amount` here is the CAPTURED amount, which may be less than the authorised
 * one. What is left over does not leak — svc-bank posts `cardAuthRelease` for
 * the remainder, and the two together are what stop a fuel-station pre-auth
 * quietly keeping a user's money.
 */
export function cardCapture(input: CardCaptureInput): PostRequest {
  requirePositive('card capture amount', input.amount);
  return {
    idempotencyKey: `bank.card.capture:${input.captureId}`,
    module: 'bank',
    reason: 'card.captured',
    meta: { authorizationId: input.authorizationId, captureId: input.captureId, issuerId: input.issuerId },
    entries: [
      credit(cardAuthHoldAccount(input.userId, input.assetId, input.authorizationId), input.amount),
      debit(cardIssuerBoundary(input.issuerId, input.assetId), input.amount),
    ],
  };
}

export interface CardReleaseInput extends CardAuthorizationInput {
  /**
   * Which release of this authorisation. 0 is the ordinary one — expiry, or the
   * unspent remainder after a partial capture. A second release only happens if
   * an authorisation is reduced twice, and it needs its own key or the ledger
   * collapses it into the first.
   */
  sequence?: number;
  /** 'expired' | 'reversed' | 'partial_capture_remainder' — for the trail. */
  reason?: string;
}

/**
 * Step 2b: the money comes back. Expiry, a reversal, or the slice of a
 * pre-authorisation the merchant never took.
 *
 * The reversal path on an outbound movement is DEFINED, not improvised — the
 * same rule `withdrawReverse` and `paymentRefundReverse` follow. Without it,
 * every abandoned pre-authorisation on the platform is a user's money in a hold
 * account with no code path that returns it.
 */
export function cardAuthRelease(input: CardReleaseInput): PostRequest {
  requirePositive('card release amount', input.amount);
  return {
    idempotencyKey: `bank.card.release:${input.authorizationId}:${input.sequence ?? 0}`,
    module: 'bank',
    reason: 'card.released',
    meta: {
      authorizationId: input.authorizationId,
      issuerId: input.issuerId,
      releaseReason: input.reason ?? 'expired',
    },
    entries: [
      credit(cardAuthHoldAccount(input.userId, input.assetId, input.authorizationId), input.amount),
      debit(userAvailable(input.userId, input.assetId), input.amount),
    ],
  };
}

export interface CardRefundInput {
  /** Business key for THIS refund — a purchase may be refunded in parts. */
  refundId: string;
  userId: string;
  assetId: string;
  amount: Amount;
  issuerId: string;
  /** The original authorisation, for the trail. Not part of the key. */
  authorizationId?: string;
}

/**
 * A merchant sent money back. Value re-enters the book from the issuer boundary.
 *
 * NOT a `cardAuthRelease`: by the time a refund arrives the authorisation has
 * been captured and its hold account is empty and closed. The value is coming
 * from outside the book, so it enters at the boundary it left through — which
 * is also what keeps the issuer boundary reconcilable against their settlement
 * file, where the refund appears as a credit.
 */
export function cardRefund(input: CardRefundInput): PostRequest {
  requirePositive('card refund amount', input.amount);
  return {
    idempotencyKey: `bank.card.refund:${input.refundId}`,
    module: 'bank',
    reason: 'card.refunded',
    meta: {
      refundId: input.refundId,
      issuerId: input.issuerId,
      ...(input.authorizationId ? { authorizationId: input.authorizationId } : {}),
    },
    entries: [
      credit(cardIssuerBoundary(input.issuerId, input.assetId), input.amount),
      debit(userAvailable(input.userId, input.assetId), input.amount),
    ],
  };
}
