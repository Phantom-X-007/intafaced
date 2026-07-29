import type { OtcTrade, OtcTradeStatus } from '../api/wire';
import { OTC_TRADE_STATUSES } from '../api/wire';

/**
 * THE OTC DESK, AS A DECISION TABLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS FOR
 *
 * svc-p2p owns the trade state machine and enforces it — this is not a second
 * copy of that authority, and it must never be treated as one. Every function
 * here answers a *presentation* question: given a trade the service already
 * validated, what should this user be shown, and what should the screen say
 * about where their money is?
 *
 * The service is still the only thing that decides. If this table offers a
 * button the service refuses, the user gets the service's refusal — which is
 * correct, and is why `canRelease` here is a hint and `assertTransition` there
 * is the law. What this table must never do is the opposite: hide an action the
 * user is entitled to take, because a hidden "release" is a stranded seller.
 *
 * ── THE QUESTION THIS CODEBASE ASKS EVERYWHERE ─────────────────────────────
 *
 *   "If the process dies exactly here, whose funds are stranded and how do they
 *    get them back?"
 *
 * `CUSTODY` below answers it for every state, in the user's own words, and the
 * desk renders that answer on screen next to the trade. That is the point: the
 * guarantee already exists in svc-p2p (sweeps, idempotent recipes, a resolution
 * column the database will only let you write once) — but a guarantee the user
 * cannot see is indistinguishable, to them, from having lost their money.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Which side of a trade this session is on. `null` = neither (moderator, or a stale view). */
export type TradeRole = 'buyer' | 'seller' | null;

export function roleOf(trade: OtcTrade, userId: string | null): TradeRole {
  if (!userId) return null;
  if (trade.buyerId === userId) return 'buyer';
  if (trade.sellerId === userId) return 'seller';
  return null;
}

/**
 * Where the asset physically is, per state. Not a mood — a claim about the
 * ledger that `escrowIntegrity()` in svc-p2p can be asked to confirm.
 */
export type Custody =
  /** Nothing has moved. The seller still holds it in `available`. */
  | 'with-seller'
  /** In the ledger's `escrow` account kind. Neither party can spend it. */
  | 'in-escrow'
  /** Terminal: it reached the buyer. */
  | 'delivered'
  /** Terminal: it went back to the seller. */
  | 'returned';

export interface CustodyFact {
  readonly custody: Custody;
  /** One sentence, safe to render, written for the person whose money it is. */
  readonly where: string;
  /** What happens with no further human action. The stranding answer. */
  readonly ifNobodyActs: string;
}

/**
 * THE STRANDED-FUNDS TABLE, in the user's words.
 *
 * Total over `OtcTradeStatus` by construction — `custodyOf` is a `switch` with
 * no `default`, so adding a status upstream is a type error here rather than a
 * trade rendered with no custody line. A test asserts totality anyway, because
 * the schema parse is what would actually fail first at runtime.
 */
export function custodyOf(trade: OtcTrade): CustodyFact {
  switch (trade.status) {
    case 'created':
      // The window between reserving inventory and the escrow lock landing.
      // svc-p2p re-drives the lock rather than guessing, so this resolves either
      // way — but from the user's side it is genuinely "nothing has moved yet".
      return {
        custody: 'with-seller',
        where: 'Nothing has moved yet. The escrow lock has not been confirmed.',
        ifNobodyActs:
          'This trade expires within about two minutes and is voided. If the lock did land, it is refunded to the seller instead — svc-p2p re-drives the lock to find out rather than assuming.',
      };

    case 'escrowed':
      return {
        custody: 'in-escrow',
        where: `${trade.amount} ${trade.asset} is held in escrow by the ledger. The seller cannot spend it and the buyer has not received it.`,
        ifNobodyActs: 'If the buyer never marks the fiat sent, the payment window expires and the full amount is refunded to the seller automatically.',
      };

    case 'fiat_sent':
      return {
        custody: 'in-escrow',
        where: `${trade.amount} ${trade.asset} is still in escrow. The buyer says the fiat has been sent; the seller has not confirmed it landed.`,
        // The one place this platform deliberately refuses to auto-settle.
        ifNobodyActs:
          'If the seller never confirms, this becomes a dispute for a moderator — it is never auto-released. Auto-releasing here would hand the asset to anyone willing to press a button and wait.',
      };

    case 'disputed':
      return {
        custody: 'in-escrow',
        where: `${trade.amount} ${trade.asset} is in escrow and frozen pending a moderator's decision.`,
        ifNobodyActs:
          'A moderator releases to the buyer or refunds the seller. If no moderator rules at all, a backstop resolves it when the dispute window closes — the escrow is never left open.',
      };

    case 'released':
      return {
        custody: 'delivered',
        where: `${trade.amount} ${trade.asset} was released to the buyer.`,
        ifNobodyActs: 'Nothing further happens. This trade is settled and cannot move again.',
      };

    case 'cancelled':
      return {
        custody: trade.resolution === 'refunded' ? 'returned' : 'with-seller',
        where:
          trade.resolution === 'refunded'
            ? `${trade.amount} ${trade.asset} was refunded to the seller in full.`
            : 'Nothing was ever locked, so nothing needed to be returned.',
        ifNobodyActs: 'Nothing further happens. This trade is settled and cannot move again.',
      };
  }
}

/**
 * `settled_at` is stamped only after the ledger post returns. A trade that is
 * resolved but not settled is the "funds are late, not stranded" window — the
 * settlement sweep is re-posting it, and the desk says so rather than showing a
 * finished trade whose value has not actually moved.
 */
export function isSettlementPending(trade: OtcTrade): boolean {
  return trade.resolvedAt !== null && trade.settledAt === null;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type OtcAction = 'markFiatSent' | 'confirmReceived' | 'cancel' | 'openDispute';

export interface ActionOffer {
  readonly action: OtcAction;
  readonly label: string;
  /** What it does to the money, stated before the user presses it. */
  readonly consequence: string;
  /** True when it is the action that moves value irreversibly. */
  readonly irreversible: boolean;
}

/**
 * What this user may do to this trade right now.
 *
 * Mirrors the edge list in `services/svc-p2p/src/state.ts` intersected with who
 * the actor is. The service re-checks all of it; the value of doing it here is
 * that a buyer is never shown "confirm received", which is a button that can
 * only ever produce a refusal and a confused user.
 */
export function actionsFor(trade: OtcTrade, role: TradeRole): readonly ActionOffer[] {
  if (role === null) return [];

  const offers: ActionOffer[] = [];

  switch (trade.status) {
    case 'created':
      // Deliberately nothing. The escrow lock is in flight; svc-p2p's sweeper
      // owns this state. Offering "cancel" here invites a refund request against
      // an escrow that may not exist yet.
      break;

    case 'escrowed':
      if (role === 'buyer') {
        offers.push({
          action: 'markFiatSent',
          label: 'I have sent the payment',
          consequence: `Tells the seller you have sent ${trade.fiatAmount} ${trade.fiatCurrency}. Moves no crypto. Only press this once the transfer has actually left your account.`,
          irreversible: false,
        });
      }
      if (role === 'seller') {
        offers.push({
          action: 'confirmReceived',
          label: 'Payment received — release',
          consequence: `Releases ${trade.amount} ${trade.asset} from escrow to the buyer. This cannot be undone.`,
          irreversible: true,
        });
      }
      offers.push({
        action: 'cancel',
        label: 'Cancel trade',
        consequence: `Refunds ${trade.amount} ${trade.asset} to the seller in full. Do not cancel if you have already sent the fiat — open a dispute instead.`,
        irreversible: true,
      });
      offers.push({
        action: 'openDispute',
        label: 'Open a dispute',
        consequence: 'Escalates to a moderator. The escrow stays frozen until they rule.',
        irreversible: false,
      });
      break;

    case 'fiat_sent':
      if (role === 'seller') {
        offers.push({
          action: 'confirmReceived',
          label: 'Payment received — release',
          consequence: `Releases ${trade.amount} ${trade.asset} from escrow to the buyer. This cannot be undone.`,
          irreversible: true,
        });
        // A seller may still refund voluntarily; a buyer who has declared
        // payment may not cancel, and svc-p2p rejects it if they try.
        offers.push({
          action: 'cancel',
          label: 'Refund the buyer’s claim and cancel',
          consequence: `Refunds ${trade.amount} ${trade.asset} to yourself. Only do this if the payment did not arrive and the buyer agrees.`,
          irreversible: true,
        });
      }
      offers.push({
        action: 'openDispute',
        label: 'Open a dispute',
        consequence: 'Escalates to a moderator. The escrow stays frozen until they rule.',
        irreversible: false,
      });
      break;

    case 'disputed':
    case 'released':
    case 'cancelled':
      // A moderator resolves a dispute through `admin:compliance`, which is not
      // this surface. Terminal states offer nothing at all.
      break;
  }

  return offers;
}

/** Human label for a status. Terminal states name their resolution. */
export function describeStatus(trade: OtcTrade): string {
  switch (trade.status) {
    case 'created':
      return 'Escrow pending';
    case 'escrowed':
      return 'In escrow — awaiting payment';
    case 'fiat_sent':
      return 'Payment declared — awaiting release';
    case 'disputed':
      return 'In dispute';
    case 'released':
      return 'Released to buyer';
    case 'cancelled':
      return trade.resolution === 'refunded' ? 'Cancelled — refunded to seller' : 'Cancelled — nothing was locked';
  }
}

/** Live states carry a clock; terminal ones must not. Mirrors the DB constraints. */
export function isLive(status: OtcTradeStatus): boolean {
  return status !== 'released' && status !== 'cancelled';
}

/** Exported for the totality test. */
export const ALL_STATUSES = OTC_TRADE_STATUSES;
