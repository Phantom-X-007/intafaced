import type { Amount } from '@intafaced/ledger-client';
import type { CardProgramme } from './policy.js';

/**
 * THE AUTHORISATION DECISION (§8.1, §20).
 *
 * §20 budgets a card auth decision at "< 2s incl. on-chain JIT conversion",
 * against a Revolut-class benchmark. The scheme's own timeout is tighter than
 * that and it does not negotiate: an answer that arrives late is a decline, and
 * a decline at the till is the only failure on this platform a user's friends
 * watch happen.
 *
 * So this file is a PURE FUNCTION. No I/O, no clock of its own, no database.
 * Everything it needs is passed in, which means the two-second budget is spent
 * entirely on the two calls around it — read the window, post the hold — and
 * the decision itself is free and exhaustively testable.
 *
 * The ordering below is deliberate: cheapest and most certain refusals first,
 * so a frozen card never costs a balance read, and the balance read never
 * happens for a request that a limit would have refused anyway.
 */

export const CARD_STATUSES = ['active', 'frozen', 'closed'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/** How the transaction reached us. Programmes gate these independently. */
export const CARD_CHANNELS = ['pos', 'online', 'atm'] as const;
export type CardChannel = (typeof CARD_CHANNELS)[number];

export type AuthorizationCode =
  | 'approved'
  | 'card.frozen'
  | 'card.closed'
  | 'card.programme_not_live'
  | 'card.asset_mismatch'
  | 'card.amount_invalid'
  | 'card.atm_not_permitted'
  | 'card.online_not_permitted'
  | 'card.cross_border_not_permitted'
  | 'card.per_authorization_limit'
  | 'card.daily_limit'
  | 'card.monthly_limit'
  | 'card.insufficient_funds'
  /**
   * §18's self-custody path is not wired. See `card-service.ts` — the JIT
   * settlement leg needs a contract this repo does not have yet, and the honest
   * answer at the till is a decline with a name, not an approval we cannot fund.
   */
  | 'card.sovereign_settlement_unavailable';

export interface AuthorizationDecision {
  readonly approved: boolean;
  readonly code: AuthorizationCode;
  readonly reason: string;
  /** The cap that bound, when a limit was the thing that refused. */
  readonly limit?: Amount;
}

/**
 * What this card has already spent in the windows the programme caps.
 *
 * Derived, never stored: it is `SUM(amount)` over this card's authorisation
 * records in the window. A `cards.spent_today` column would be a second source
 * of truth for money, which §8.1 and Doctrine §0.6 both forbid, and it would
 * drift the first time a reversal was posted without decrementing it.
 */
export interface CardSpendWindow {
  /** Approved-and-not-reversed value since the start of the current UTC day. */
  readonly day: Amount;
  /** Same, since the start of the current UTC month. */
  readonly month: Amount;
}

export interface AuthorizationRequest {
  readonly amount: Amount;
  readonly assetId: string;
  readonly channel: CardChannel;
  /** Merchant country differs from the card's programme region. */
  readonly crossBorder: boolean;
}

export interface AuthorizationQuery {
  readonly status: CardStatus;
  readonly cardAssetId: string;
  readonly programme: CardProgramme;
  readonly request: AuthorizationRequest;
  readonly window: CardSpendWindow;
  /**
   * The user's spendable ledger balance, read at request time.
   *
   * Only meaningful for a `ledger`-funded card. A `self_custody` card's balance
   * is on the Protocol Plane and this service does not — and must not — read it
   * through a path that could also write it.
   */
  readonly availableBalance: Amount;
}

const deny = (code: AuthorizationCode, reason: string, limit?: Amount): AuthorizationDecision => ({
  approved: false,
  code,
  reason,
  ...(limit === undefined ? {} : { limit }),
});

/**
 * Approve or decline. Deterministic, side-effect free, and total: every input
 * produces a named code, because "declined" with no reason is the answer that
 * generates a support ticket nobody can close.
 */
export function decideAuthorization(q: AuthorizationQuery): AuthorizationDecision {
  const { programme, request, window } = q;

  // ── Card state. Free to check, and no later check can rescue these. ───────
  if (q.status === 'closed') return deny('card.closed', 'This card is closed');
  if (q.status === 'frozen') return deny('card.frozen', 'This card is frozen');
  if (programme.status !== 'live') {
    return deny('card.programme_not_live', `Card programme "${programme.code}" is ${programme.status}`);
  }

  // ── The request itself. ──────────────────────────────────────────────────
  if (request.amount <= 0n) return deny('card.amount_invalid', 'Authorisation amount must be positive');
  if (request.assetId !== q.cardAssetId) {
    // The programme's limits are denominated in the card's asset. Comparing an
    // amount in another asset against them would be arithmetic on two different
    // units that happens to compile.
    return deny('card.asset_mismatch', `This card settles in ${q.cardAssetId}, not ${request.assetId}`);
  }

  // ── Controls the issuer set on the programme. ────────────────────────────
  if (request.channel === 'atm' && !programme.atmEnabled) {
    return deny('card.atm_not_permitted', 'ATM withdrawal is not enabled on this programme');
  }
  if (request.channel === 'online' && !programme.onlineEnabled) {
    return deny('card.online_not_permitted', 'Online spend is not enabled on this programme');
  }
  if (request.crossBorder && !programme.crossBorderEnabled) {
    return deny('card.cross_border_not_permitted', 'Cross-border spend is not enabled on this programme');
  }

  // ── Limits. Checked narrowest-first so the message names the tightest cap
  //    the user actually hit, rather than whichever happened to be tested first.
  if (request.amount > programme.perAuthorizationLimit) {
    return deny(
      'card.per_authorization_limit',
      'This transaction is above the per-transaction limit for this card',
      programme.perAuthorizationLimit,
    );
  }
  if (window.day + request.amount > programme.dailyLimit) {
    return deny('card.daily_limit', 'This transaction would exceed the daily limit for this card', programme.dailyLimit);
  }
  if (window.month + request.amount > programme.monthlyLimit) {
    return deny('card.monthly_limit', 'This transaction would exceed the monthly limit for this card', programme.monthlyLimit);
  }

  /**
   * ── Funding. Last, because it is the only check that depends on a read.
   *
   * §18's self-custody card settles by pulling the fiat equivalent from the
   * user's own smart account at the authorisation moment. That leg does not
   * exist in this repo: a session key is forbidden from moving tokens
   * (`svc-protocol` session/spec.ts FORBIDDEN_SIGNATURES, Doctrine §16.10), so
   * the pull needs an owner-granted allowance to a card settlement contract
   * that has not been written.
   *
   * Until it is, this declines. It does NOT fall back to the ledger balance:
   * silently funding a "self-custody" card from a custodial balance is the
   * exact substitution the user was promised would never happen, and it would
   * turn a zero-verification programme into a custodial one at the till.
   */
  if (programme.fundingSource === 'self_custody') {
    return deny(
      'card.sovereign_settlement_unavailable',
      'Self-custody funded cards cannot be authorised yet — the just-in-time settlement leg (§18) is not built',
    );
  }

  if (q.availableBalance < request.amount) {
    return deny('card.insufficient_funds', 'Not enough available balance to cover this transaction');
  }

  return { approved: true, code: 'approved', reason: 'Within programme limits and funded' };
}

/**
 * §18: "cashback in IFC on-chain". This is the amount, not the payment.
 *
 * Kept beside the decision because it is priced off the captured amount and the
 * programme rate, and nowhere else. The payment itself is `rewardPay`, which
 * already exists — svc-bank does not invent a second way to pay a reward.
 *
 * Rounds DOWN: we never promise a rounding unit more cashback than the
 * published rate earns, which is the opposite of how `feeCharge` rounds a
 * discount, and for the same reason — both round in the user's favour.
 */
export function cashbackFor(capturedAmount: Amount, cashbackBps: number): Amount {
  if (capturedAmount <= 0n || cashbackBps <= 0) return 0n;
  return (capturedAmount * BigInt(cashbackBps)) / 10_000n;
}
