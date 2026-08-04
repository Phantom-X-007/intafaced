import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import {
  InsufficientFundsError,
  LedgerError,
  formatAmount,
  parseAmount,
  recipes,
  rewardsEngine,
  userAvailable,
  withdrawalHoldAccount,
  type Amount,
  type LedgerClient,
} from '@intafaced/ledger-client';
import { BankError } from '../errors.js';
import { withMoneySpan } from '../tracing.js';
import { cashbackOn, noCardIssuer, type CardIssuerAdapter } from './issuer.js';

/**
 * CARDS (§8.1) — the LEDGER half: authorise, hold, capture, reverse, cash back.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THIS SERVICE ADDS NO RECIPE, AND THAT IS THE INTERESTING PART
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * A card spend is a WITHDRAWAL. That sentence is the whole design, and once it
 * is said out loud the four recipes this module needs already exist:
 *
 *   authorisation approved  `withdrawHold`     available → hold, one account
 *                                              per authorisation
 *   capture (clearing)      `withdrawSettle`   hold → rail boundary; the value
 *                                              leaves our book
 *   the unspent remainder   `withdrawReverse`  hold → available, defined rather
 *                                              than improvised
 *   cashback                `rewardPay`        rewards engine → available
 *
 * The staging is not a convenience — it is what makes "authorised but not yet
 * captured" a BALANCE somebody can read (`withdrawalHoldAccount(user, asset,
 * authId)`) instead of an incident to be reconstructed. It is the same argument
 * `merchantClearing` makes for payments and `loanCollateralAccount` makes for
 * collateral, and it is why a partial capture here is two postings and not one
 * adjusted number: the merchant takes what they charged, the remainder goes
 * back, and the hold account ends at exactly zero.
 *
 * A new recipe would have been the wrong instinct twice over. `packages/ledger-
 * client` is owner carve-out territory, and more to the point a `cardSpend`
 * recipe would have been `withdrawSettle` with a different string in it — a
 * second way to spell one movement, which is how two subsystems come to
 * disagree about what happened.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * IF THE PROCESS DIES EXACTLY HERE, WHOSE FUNDS ARE STRANDED?
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * ── authorize(): decide, claim, THEN hold ────────────────────────────────────
 *
 *   after the decision row, before the hold post
 *     The authorisation is `approved` and `pending` with no ledger transaction.
 *     Nothing has moved and nothing is stranded: the user's funds are still
 *     their own available balance. A redelivered webhook re-drives it, and the
 *     post is idempotent on `withdraw.hold:<authorisation uuid>`, so it finds the
 *     original transaction or makes it once.
 *
 *   after the hold post, before the row is marked settled
 *     The funds are in a hold account keyed to THIS authorisation — an account
 *     the ledger says belongs to the user. The record catches up on re-drive.
 *     The worst case is a hold nobody captures, which `reverse()` returns.
 *
 *   THE REVERSE ORDER IS THE BUG. Hold-then-decide would post against an
 *   authorisation that has no row, so a crash would leave value in an account
 *   whose key nothing on this side can reconstruct.
 *
 * ── capture(): capture and reverse are two posts, and both must happen ───────
 *
 *   after the capture, before the remainder is returned
 *     The merchant has been paid and the user's unspent remainder is still in
 *     the hold account. Visible — `cards.test.ts` reads that account directly —
 *     and returned by re-driving `capture` with the same amount, because both
 *     posts are idempotent on the authorisation. Nothing is lost; something is
 *     late.
 *
 *     They are NOT one posting, unlike the loan seizure. The argument that made
 *     a liquidation atomic was that the borrower could spend inside the window;
 *     here the window contains value the user CANNOT reach — it is in a hold —
 *     so splitting it costs a delay and buys two independently auditable facts.
 *
 * ── cashback(): after the money moved, and allowed to fail on its own ────────
 *
 *   Cashback is paid on a CAPTURE, never on an authorisation, because an
 *   authorisation that is later reversed is a purchase that did not happen and
 *   the reward would have to be clawed back from a balance the user may have
 *   already spent. Paying late is honest; taking money back is not a thing this
 *   service can do.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT IS NOT HERE
 * ═════════════════════════════════════════════════════════════════════════════
 *
 *   · A LIVE RAIL. `socket.live-issuer` — a card-scheme sponsor and an issuing
 *     BIN. See `issuer.ts`, which is the seam, and states at length what
 *     `card-sim` is not.
 *   · REFUNDS. A merchant-initiated refund is value re-entering the book over
 *     the rail (`recipes.deposit`, rail `card-sim`), and it is not built here
 *     because it brings a question this module has not answered: whether the
 *     cashback paid on the original capture is clawed back. It is a product
 *     decision with a real answer either way, and inventing one to make a
 *     module look finished is how a card programme ends up paying for purchases
 *     that were returned.
 *   · DISPUTES AND CHARGEBACKS. A scheme process, downstream of a scheme.
 *   · INCREMENTAL AUTHORISATIONS, and any multi-capture flow. One capture per
 *     authorisation, enforced by `unique(authorization_id, sequence)` plus the
 *     closed check. Hotel and fuel flows need the first; they also need a live
 *     rail to be worth having.
 *   · FRAUD SCORING, velocity limits, 3-D Secure, MCC policy. All of it belongs
 *     to a rail, and none of it is simulated here — a decline in this module is
 *     always one of four named reasons and never a score.
 */

export interface CardRecord {
  id: string;
  userId: string;
  assetId: string;
  issuer: string;
  /** TRUE MEANS NO CARD EXISTS. Carried on every surface that renders a card. */
  simulated: boolean;
  issuerRef: string;
  panTail: string;
  status: 'active' | 'frozen' | 'closed';
  cashbackBps: number;
  perAuthorizationLimit: Amount;
}

export interface AuthorizationRecord {
  id: string;
  cardId: string;
  authorizationRef: string;
  amount: Amount;
  merchantCategory: string | null;
  decision: 'approved' | 'declined';
  declineCode: string | null;
  status: 'pending' | 'settled' | 'rejected';
  holdLedgerTxId: string | null;
  decidedAt: Date;
}

/** What a capture did, including the reward it could not pay. */
export interface CaptureResult {
  authorizationId: string;
  captured: Amount;
  /** The unspent part of the hold, returned in the same pass. Often zero. */
  returned: Amount;
  captureLedgerTxId: string;
  reversalLedgerTxId: string | null;
  cashback: CashbackOutcome;
}

/**
 * Cashback is reported, never assumed.
 *
 * `refused` is a first-class outcome with a code on it. A capture whose reward
 * could not be paid is not a failed capture, and it is not a silent success
 * either — an operator seeing `bank.cashback_pot_unfunded` has learned that the
 * advertised rate is currently unfunded, on the day it became true.
 */
export type CashbackOutcome =
  | { readonly status: 'none'; readonly amount: Amount }
  | { readonly status: 'paid'; readonly amount: Amount; readonly ledgerTxId: string }
  | { readonly status: 'refused'; readonly amount: Amount; readonly reason: string };

export interface CardServiceOptions {
  /**
   * Absent means NO CARD PROGRAMME, and every procedure refuses by name.
   *
   * Same posture as the loan price source: the dangerous default is the
   * plausible one, so there is no default. See `noCardIssuer`.
   */
  readonly issuer?: CardIssuerAdapter;
}

export class CardService {
  private readonly issuer: CardIssuerAdapter;

  constructor(
    private readonly sql: Sql,
    private readonly ledger: LedgerClient,
    options: CardServiceOptions = {},
  ) {
    this.issuer = options.issuer ?? noCardIssuer;
  }

  /** What this deployment's card programme is, and whether it is real. */
  programme(): CardIssuerAdapter['programme'] {
    return this.issuer.programme;
  }

  // ── Cards ──────────────────────────────────────────────────────────────────

  /**
   * Issue a card against one of the user's asset balances.
   *
   * The issuer is asked FIRST. A row written before the issuer answered would be
   * a card this service believes in and no issuer has heard of, and on a live
   * rail that is a card a user can see in the app and cannot use anywhere.
   */
  async issue(input: {
    cardId: string;
    userId: string;
    assetId: string;
    cashbackBps?: number;
    perAuthorizationLimit: Amount;
  }): Promise<CardRecord> {
    if (input.perAuthorizationLimit <= 0n) {
      throw new BankError('A card needs a positive per-authorisation limit', 'bank.card_limit_exceeded');
    }

    const handle = await this.issuer.issue({ cardId: input.cardId, userId: input.userId, assetId: input.assetId });
    const programme = this.issuer.programme;

    const rows = await this.sql<CardRow[]>`
      INSERT INTO bank.cards (id, user_id, asset_id, issuer, simulated, issuer_ref, pan_tail, cashback_bps, per_authorization_limit)
      VALUES (
        ${input.cardId}, ${input.userId}, ${input.assetId}, ${programme.id}, ${programme.simulated},
        ${handle.issuerRef}, ${handle.panTail}, ${input.cashbackBps ?? 0},
        ${formatAmount(input.perAuthorizationLimit)}::numeric
      )
      ON CONFLICT (issuer, issuer_ref) DO NOTHING
      RETURNING id, user_id, asset_id, issuer, simulated, issuer_ref, pan_tail, status, cashback_bps, per_authorization_limit
    `;

    // A redelivered issue is the same card, not a second one drawing on the same
    // balance. The unique index is what makes that true; this reads it back.
    const existing = rows[0] ?? (await this.cardByIssuerRef(programme.id, handle.issuerRef));
    if (!existing) throw new BankError('Card could not be issued', 'bank.card_not_found');
    return toCard(existing);
  }

  async card(cardId: string): Promise<CardRecord> {
    const rows = await this.sql<CardRow[]>`
      SELECT id, user_id, asset_id, issuer, simulated, issuer_ref, pan_tail, status, cashback_bps, per_authorization_limit FROM bank.cards WHERE id = ${cardId}
    `;
    const row = rows[0];
    if (!row) throw new BankError(`Card ${cardId} not found`, 'bank.card_not_found');
    return toCard(row);
  }

  async cardsOf(userId: string): Promise<CardRecord[]> {
    const rows = await this.sql<CardRow[]>`
      SELECT id, user_id, asset_id, issuer, simulated, issuer_ref, pan_tail, status, cashback_bps, per_authorization_limit FROM bank.cards WHERE user_id = ${userId} ORDER BY created_at DESC
    `;
    return rows.map(toCard);
  }

  /**
   * Freeze, unfreeze or close a card.
   *
   * The issuer is told, and if it refuses the row is not changed: a card this
   * service thinks is frozen while the issuer still authorises on it is the
   * worst of the available states, because the user has been told they are safe.
   */
  async setStatus(cardId: string, status: CardRecord['status']): Promise<CardRecord> {
    const card = await this.card(cardId);
    if (card.status === 'closed' && status !== 'closed') {
      throw new BankError('A closed card cannot be reopened', 'bank.card_not_active');
    }

    await this.issuer.setStatus({ cardId: card.id, issuerRef: card.issuerRef, status });
    await this.sql`UPDATE bank.cards SET status = ${status}, updated_at = now() WHERE id = ${cardId}`;
    return this.card(cardId);
  }

  // ── The authorisation webhook ──────────────────────────────────────────────

  /**
   * AN AUTHORISATION ARRIVED. Decide, and hold if the answer is yes.
   *
   * The order is: recorded decision first (a redelivery must not decide twice),
   * then the ledger, then the issuer. The ledger is the AUTHORITY on whether the
   * money is there — the balance read below is a fast path that lets a shortfall
   * be recorded as a decline instead of thrown as an exception, and if the two
   * ever disagree the post is the one that decides, because between the read and
   * the post the user may have spent the money somewhere else.
   */
  async authorize(input: {
    cardId: string;
    authorizationRef: string;
    amount: Amount;
    merchantCategory?: string;
  }): Promise<AuthorizationRecord> {
    const card = await this.card(input.cardId);

    // Idempotency, before anything else. An issuer redelivering an
    // authorisation must receive the decision it already got, and must not cause
    // a second hold against the same purchase.
    const already = await this.authorizationByRef(card.id, input.authorizationRef);
    if (already) return already;

    return withMoneySpan(
      'bank.card.authorize',
      { operation: 'card-authorize', cardId: card.id, amount: formatAmount(input.amount), assetId: card.assetId },
      async (span) => {
        const declineCode = await this.declineReason(card, input.amount);

        if (declineCode) {
          span.setAttribute('intafaced.card_decision', 'declined');
          const declined = await this.recordDecision({ card, input, decision: 'declined', declineCode });
          await this.tellIssuer(card, declined, { decision: 'declined', reason: declineCode });
          return declined;
        }

        const claimed = await this.recordDecision({ card, input, decision: 'approved', declineCode: null });

        try {
          const posted = await this.ledger.post(
            recipes.withdrawHold({
              userId: card.userId,
              assetId: card.assetId,
              amount: input.amount,
              // The rail label IS the programme id, so the boundary account a
              // capture lands in is greppable back to the card that made it.
              rail: card.issuer,
              // OUR uuid, not the issuer's reference: the hold account is keyed
              // on it, and an id chosen by a counterparty must not name an
              // account in our book.
              withdrawalId: claimed.id,
            }),
          );

          await this.sql`
            UPDATE bank.card_authorizations
               SET status = 'settled', hold_ledger_tx_id = ${posted.id}, settled_at = now()
             WHERE id = ${claimed.id}
          `;
        } catch (err) {
          // The ledger is the authority and it just said no. The DECISION
          // becomes a decline — a purchase the user was told about at the till —
          // rather than an exception that leaves an `approved` row with no hold.
          if (err instanceof InsufficientFundsError || (err instanceof LedgerError && err.code === 'ledger.insufficient_funds')) {
            await this.sql`
              UPDATE bank.card_authorizations
                 SET decision = 'declined', decline_code = 'ledger.insufficient_funds', status = 'rejected'
               WHERE id = ${claimed.id}
            `;
            const declined = (await this.authorizationByRef(card.id, input.authorizationRef))!;
            await this.tellIssuer(card, declined, { decision: 'declined', reason: 'ledger.insufficient_funds' });
            return declined;
          }
          // Anything else — svc-ledger unreachable, a frozen module — must NOT
          // be turned into a decline. A decline is an answer, and answering
          // "no" on behalf of a ledger that never spoke is a lie the user pays
          // for at the till. The row stays `pending` and a redelivery re-drives.
          throw err;
        }

        span.setAttribute('intafaced.card_decision', 'approved');
        const approved = (await this.authorizationByRef(card.id, input.authorizationRef))!;
        await this.tellIssuer(card, approved, { decision: 'approved', amount: input.amount });
        return approved;
      },
    );
  }

  /**
   * The four reasons this service declines, and there are only four.
   *
   * No score, no velocity, no risk model — those belong to a rail. Each of these
   * is a fact somebody can check afterwards, which is the property a decline
   * needs most: a user asking "why" gets a reason, not a probability.
   */
  private async declineReason(card: CardRecord, amount: Amount): Promise<string | null> {
    if (card.status !== 'active') return 'bank.card_not_active';
    if (amount > card.perAuthorizationLimit) return 'bank.card_limit_exceeded';

    const balance = (await this.ledger.balance(userAvailable(card.userId, card.assetId))).amount;
    if (balance < amount) return 'ledger.insufficient_funds';
    return null;
  }

  /**
   * Tell the issuer, and never let the telling undo the decision.
   *
   * The decision is already true — it is a row, and on an approval the funds are
   * already held. If the issuer cannot be reached, the network will treat the
   * silence as a decline at the till and the hold is released by `reverse()`
   * when the authorisation expires. Throwing here would instead unwind a
   * transaction the ledger has already committed.
   */
  private async tellIssuer(
    card: CardRecord,
    authorization: AuthorizationRecord,
    outcome: Parameters<CardIssuerAdapter['respondToAuthorization']>[0]['outcome'],
  ): Promise<void> {
    try {
      await this.issuer.respondToAuthorization({
        cardId: card.id,
        issuerRef: card.issuerRef,
        authorizationRef: authorization.authorizationRef,
        outcome,
      });
    } catch {
      // Deliberately swallowed HERE and nowhere else in this file. The
      // authorisation row is the durable record of what we decided; delivery is
      // a separate fact, and the loans module keeps the same distinction between
      // a margin call raised and a margin call notified.
    }
  }

  // ── Capture and reversal ───────────────────────────────────────────────────

  /**
   * The merchant took `amount`. The rest of the hold goes back to the user.
   *
   * Two postings, in this order, both idempotent on the authorisation:
   *
   *   1. `withdrawSettle` for the captured amount — value leaves the book at
   *      `rail/<issuer>/<asset>`.
   *   2. `withdrawReverse` for the remainder, when there is one — value returns
   *      to the user's available balance.
   *
   * After both, the authorisation's hold account reads zero. That is the
   * invariant worth checking, and the test checks it on the ACCOUNT rather than
   * by adding up these two rows.
   */
  async capture(input: { cardId: string; authorizationRef: string; amount: Amount }): Promise<CaptureResult> {
    const card = await this.card(input.cardId);
    const authorization = await this.requireOpenAuthorization(card, input.authorizationRef);

    if (input.amount <= 0n || input.amount > authorization.amount) {
      throw new BankError(
        `Capture of ${formatAmount(input.amount)} exceeds the authorised ${formatAmount(authorization.amount)}`,
        'bank.card_capture_exceeds_authorization',
      );
    }

    return withMoneySpan(
      'bank.card.capture',
      { operation: 'card-capture', cardId: card.id, amount: formatAmount(input.amount), assetId: card.assetId },
      async () => {
        const captureTxId = await this.settlement({
          authorization,
          sequence: 0,
          kind: 'capture',
          amount: input.amount,
          post: () =>
            this.ledger.post(
              recipes.withdrawSettle({
                userId: card.userId,
                assetId: card.assetId,
                amount: input.amount,
                rail: card.issuer,
                withdrawalId: authorization.id,
              }),
            ),
        });

        const remainder = authorization.amount - input.amount;
        const reversalTxId =
          remainder > 0n
            ? await this.settlement({
                authorization,
                sequence: 1,
                kind: 'reversal',
                amount: remainder,
                post: () =>
                  this.ledger.post(
                    recipes.withdrawReverse({
                      userId: card.userId,
                      assetId: card.assetId,
                      amount: remainder,
                      rail: card.issuer,
                      withdrawalId: authorization.id,
                    }),
                  ),
              })
            : null;

        const cashback = await this.payCashback(card, authorization, input.amount);

        return {
          authorizationId: authorization.id,
          captured: input.amount,
          returned: remainder,
          captureLedgerTxId: captureTxId,
          reversalLedgerTxId: reversalTxId,
          cashback,
        };
      },
    );
  }

  /**
   * The authorisation expired or was voided. Give the whole hold back.
   *
   * Sequence 0, the same slot a capture would have taken, so the unique index
   * makes "captured then reversed" impossible rather than merely unlikely.
   */
  async reverse(input: { cardId: string; authorizationRef: string }): Promise<{ returned: Amount; ledgerTxId: string }> {
    const card = await this.card(input.cardId);
    const authorization = await this.requireOpenAuthorization(card, input.authorizationRef);

    return withMoneySpan(
      'bank.card.reverse',
      { operation: 'card-reverse', cardId: card.id, amount: formatAmount(authorization.amount), assetId: card.assetId },
      async () => {
        const ledgerTxId = await this.settlement({
          authorization,
          sequence: 0,
          kind: 'reversal',
          amount: authorization.amount,
          post: () =>
            this.ledger.post(
              recipes.withdrawReverse({
                userId: card.userId,
                assetId: card.assetId,
                amount: authorization.amount,
                rail: card.issuer,
                withdrawalId: authorization.id,
              }),
            ),
        });
        return { returned: authorization.amount, ledgerTxId };
      },
    );
  }

  /** What is still held against an authorisation — read from the ledger, never stored. */
  async heldFor(authorizationId: string, userId: string, assetId: string): Promise<Amount> {
    return (await this.ledger.balance(withdrawalHoldAccount(userId, assetId, authorizationId))).amount;
  }

  // ── Cashback ───────────────────────────────────────────────────────────────

  /**
   * Pay the reward, or refuse it by name and leave the capture standing.
   *
   * The pot is `rewardsEngine(assetId)`, the same one real-yield is paid from,
   * and it is funded from bank revenue by `fundCashbackPot`. That is what makes
   * cashback a share of money the platform actually earned rather than a number
   * conjured for a marketing page — and it is also why it can refuse.
   */
  private async payCashback(card: CardRecord, authorization: AuthorizationRecord, captured: Amount): Promise<CashbackOutcome> {
    const amount = cashbackOn(captured, card.cashbackBps);
    // Zero is not a refusal and not a payment. A card with no cashback rate, or
    // a purchase too small to earn one atomic unit at that rate, earns nothing —
    // and posting a zero-value transaction to say so would be noise in the book.
    if (amount <= 0n) return { status: 'none', amount: 0n };

    const claimed = await this.sql<Array<{ id: string; status: string; ledger_tx_id: string | null }>>`
      INSERT INTO bank.card_cashback (authorization_id, rate_bps, amount)
      VALUES (${authorization.id}, ${card.cashbackBps}, ${formatAmount(amount)}::numeric)
      ON CONFLICT (authorization_id) DO NOTHING
      RETURNING id, status, ledger_tx_id
    `;

    const row =
      claimed[0] ??
      (
        await this.sql<Array<{ id: string; status: string; ledger_tx_id: string | null }>>`
          SELECT id, status, ledger_tx_id FROM bank.card_cashback WHERE authorization_id = ${authorization.id}
        `
      )[0]!;

    if (row.status === 'settled' && row.ledger_tx_id) return { status: 'paid', amount, ledgerTxId: row.ledger_tx_id };

    try {
      const posted = await this.ledger.post(
        recipes.rewardPay({
          rewardId: `bank.card.cashback:${authorization.id}`,
          userId: card.userId,
          assetId: card.assetId,
          amount,
          reason: 'bank.card.cashback',
        }),
      );
      await this.sql`
        UPDATE bank.card_cashback SET status = 'settled', ledger_tx_id = ${posted.id}, settled_at = now() WHERE id = ${row.id}
      `;
      return { status: 'paid', amount, ledgerTxId: posted.id };
    } catch (err) {
      if (err instanceof InsufficientFundsError || (err instanceof LedgerError && err.code === 'ledger.insufficient_funds')) {
        await this.sql`
          UPDATE bank.card_cashback SET status = 'rejected', rejection_code = 'bank.cashback_pot_unfunded' WHERE id = ${row.id}
        `;
        // Surfaced, not thrown. Reversing a capture the merchant already has,
        // because a reward could not be paid, would undo a purchase that
        // happened. The row and this outcome are how an operator finds it.
        return { status: 'refused', amount, reason: 'bank.cashback_pot_unfunded' };
      }
      await this.sql`
        UPDATE bank.card_cashback SET status = 'rejected', rejection_code = ${err instanceof LedgerError ? err.code : 'bank.post_failed'}
         WHERE id = ${row.id}
      `;
      throw err;
    }
  }

  /**
   * OPERATOR SURFACE: move bank revenue into the pot cashback is paid from.
   *
   * `sweepFeesToRewards` — the existing recipe, unchanged. Cashback has a NAMED
   * SOURCE and this is it: `houseFees('bank', asset)`, fees the platform really
   * charged. A pot funded from anywhere else, or from nowhere, would make the
   * advertised rate a promise against future revenue, which is a different
   * product with a different licence.
   */
  async fundCashbackPot(input: { windowId: string; assetId: string; amount: Amount }): Promise<{ ledgerTxId: string }> {
    const posted = await this.ledger.post(
      recipes.sweepFeesToRewards({
        windowId: `bank.card:${input.windowId}`,
        sourceModule: 'bank',
        assetId: input.assetId,
        amount: input.amount,
      }),
    );
    return { ledgerTxId: posted.id };
  }

  /** What the pot can currently pay. A ledger read, like every other figure here. */
  async cashbackCapacity(assetId: string): Promise<Amount> {
    return (await this.ledger.balance(rewardsEngine(assetId))).amount;
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  async authorizationsOf(cardId: string): Promise<AuthorizationRecord[]> {
    const rows = await this.sql<AuthorizationRow[]>`
      SELECT id, card_id, authorization_ref, amount, merchant_category, decision, decline_code, status, hold_ledger_tx_id, decided_at FROM bank.card_authorizations WHERE card_id = ${cardId} ORDER BY decided_at DESC
    `;
    return rows.map(toAuthorization);
  }

  async cashbackFor(authorizationId: string): Promise<{ amount: Amount; status: string; rejectionCode: string | null } | null> {
    const rows = await this.sql<Array<{ amount: string; status: string; rejection_code: string | null }>>`
      SELECT amount, status, rejection_code FROM bank.card_cashback WHERE authorization_id = ${authorizationId}
    `;
    const row = rows[0];
    return row ? { amount: parseAmount(row.amount), status: row.status, rejectionCode: row.rejection_code } : null;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async cardByIssuerRef(issuer: string, issuerRef: string): Promise<CardRow | undefined> {
    const rows = await this.sql<CardRow[]>`
      SELECT id, user_id, asset_id, issuer, simulated, issuer_ref, pan_tail, status, cashback_bps, per_authorization_limit FROM bank.cards WHERE issuer = ${issuer} AND issuer_ref = ${issuerRef}
    `;
    return rows[0];
  }

  private async authorizationByRef(cardId: string, authorizationRef: string): Promise<AuthorizationRecord | null> {
    const rows = await this.sql<AuthorizationRow[]>`
      SELECT id, card_id, authorization_ref, amount, merchant_category, decision, decline_code, status, hold_ledger_tx_id, decided_at FROM bank.card_authorizations
       WHERE card_id = ${cardId} AND authorization_ref = ${authorizationRef}
    `;
    const row = rows[0];
    return row ? toAuthorization(row) : null;
  }

  /** An authorisation that is approved, settled, and has nothing against it yet. */
  private async requireOpenAuthorization(card: CardRecord, authorizationRef: string): Promise<AuthorizationRecord> {
    const authorization = await this.authorizationByRef(card.id, authorizationRef);
    if (!authorization) {
      throw new BankError(`Authorisation ${authorizationRef} not found on this card`, 'bank.card_authorization_not_found');
    }
    if (authorization.decision !== 'approved' || authorization.status !== 'settled') {
      throw new BankError(`Authorisation ${authorizationRef} was declined and holds nothing`, 'bank.card_authorization_declined');
    }
    const settled = await this.sql<Array<{ count: string }>>`
      SELECT count(*)::text AS count FROM bank.card_settlements WHERE authorization_id = ${authorization.id} AND sequence = 0
    `;
    if (settled[0]!.count !== '0') {
      throw new BankError(`Authorisation ${authorizationRef} has already been settled`, 'bank.card_authorization_closed');
    }
    return authorization;
  }

  private async recordDecision(input: {
    card: CardRecord;
    input: { authorizationRef: string; amount: Amount; merchantCategory?: string };
    decision: 'approved' | 'declined';
    declineCode: string | null;
  }): Promise<AuthorizationRecord> {
    await this.sql`
      INSERT INTO bank.card_authorizations (card_id, authorization_ref, amount, merchant_category, decision, decline_code, status)
      VALUES (
        ${input.card.id}, ${input.input.authorizationRef}, ${formatAmount(input.input.amount)}::numeric,
        ${input.input.merchantCategory ?? null}, ${input.decision}, ${input.declineCode},
        ${input.decision === 'approved' ? 'pending' : 'rejected'}
      )
      ON CONFLICT (card_id, authorization_ref) DO NOTHING
    `;
    return (await this.authorizationByRef(input.card.id, input.input.authorizationRef))!;
  }

  /**
   * Claim the settlement row, post, mark it. Same shape as `drivenPost` in
   * `loan-service.ts` and the same crash story: the row is claimed before the
   * post so a process that dies between them leaves a `pending` row with a
   * deterministic ledger key, and re-driving finds the original transaction
   * rather than making a second one.
   */
  private async settlement(input: {
    authorization: AuthorizationRecord;
    sequence: number;
    kind: 'capture' | 'reversal';
    amount: Amount;
    post: () => Promise<{ id: string }>;
  }): Promise<string> {
    const claim = await transaction(
      this.sql,
      async (tx) => {
        const rows = await tx<Array<{ id: string; ledger_tx_id: string | null }>>`
          INSERT INTO bank.card_settlements (authorization_id, sequence, kind, amount)
          VALUES (${input.authorization.id}, ${input.sequence}, ${input.kind}, ${formatAmount(input.amount)}::numeric)
          ON CONFLICT (authorization_id, sequence) DO NOTHING
          RETURNING id, ledger_tx_id
        `;
        if (rows.length > 0) return { claimed: true as const, id: rows[0]!.id, ledgerTxId: null };
        const existing = await tx<Array<{ id: string; ledger_tx_id: string | null }>>`
          SELECT id, ledger_tx_id FROM bank.card_settlements
           WHERE authorization_id = ${input.authorization.id} AND sequence = ${input.sequence}
        `;
        return { claimed: false as const, id: existing[0]!.id, ledgerTxId: existing[0]!.ledger_tx_id };
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );

    if (!claim.claimed && claim.ledgerTxId) return claim.ledgerTxId;

    let posted: { id: string };
    try {
      posted = await input.post();
    } catch (err) {
      await this.sql`
        UPDATE bank.card_settlements
           SET status = 'rejected', rejection_code = ${err instanceof LedgerError ? err.code : 'bank.post_failed'}
         WHERE id = ${claim.id}
      `;
      throw err;
    }

    await this.sql`
      UPDATE bank.card_settlements SET status = 'settled', ledger_tx_id = ${posted.id}, settled_at = now() WHERE id = ${claim.id}
    `;
    return posted.id;
  }
}

// ── Row mapping ──────────────────────────────────────────────────────────────

interface CardRow {
  id: string;
  user_id: string;
  asset_id: string;
  issuer: string;
  simulated: boolean;
  issuer_ref: string;
  pan_tail: string;
  status: CardRecord['status'];
  cashback_bps: number;
  per_authorization_limit: string;
}

interface AuthorizationRow {
  id: string;
  card_id: string;
  authorization_ref: string;
  amount: string;
  merchant_category: string | null;
  decision: 'approved' | 'declined';
  decline_code: string | null;
  status: AuthorizationRecord['status'];
  hold_ledger_tx_id: string | null;
  decided_at: Date;
}

function toCard(row: CardRow): CardRecord {
  return {
    id: row.id,
    userId: row.user_id,
    assetId: row.asset_id,
    issuer: row.issuer,
    simulated: row.simulated,
    issuerRef: row.issuer_ref,
    panTail: row.pan_tail,
    status: row.status,
    cashbackBps: Number(row.cashback_bps),
    perAuthorizationLimit: parseAmount(row.per_authorization_limit),
  };
}

function toAuthorization(row: AuthorizationRow): AuthorizationRecord {
  return {
    id: row.id,
    cardId: row.card_id,
    authorizationRef: row.authorization_ref,
    amount: parseAmount(row.amount),
    merchantCategory: row.merchant_category,
    decision: row.decision,
    declineCode: row.decline_code,
    status: row.status,
    holdLedgerTxId: row.hold_ledger_tx_id,
    decidedAt: row.decided_at,
  };
}
