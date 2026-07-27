/**
 * THE TRADE STATE MACHINE (§6.2) — pure, no I/O, exhaustively testable.
 *
 *                       ┌──────────── cancelled (voided) ──────────┐
 *                       │              nothing was ever locked      │
 *   created ─── lock ──▶ escrowed ─── buyer marks paid ──▶ fiat_sent
 *      │                    │                                  │
 *      │                    ├──── cancel / payment timeout ────┤
 *      │                    │            ▼                     │
 *      │                    └──▶ cancelled (refunded) ◀────────┤
 *      │                                                        │
 *      │                    seller confirms fiat received       │
 *      │                             ▼                          │
 *      │                        released ◀──────────────────────┘
 *      │                             ▲
 *      └── escrow-lock failed        │  moderator: release
 *          (voided)             disputed ── moderator: refund ──▶ cancelled
 *                                    ▲
 *                       either party, or the release timeout
 *
 * THE LAW OF THIS FILE, in one line:
 *
 *   Every state that holds value has at least one edge out of it that some
 *   clock will eventually take on its own.
 *
 * `created`, `escrowed`, `fiat_sent` and `disputed` all carry a deadline (the
 * database enforces it: `p2p_trades_live_has_deadline_ck`). `released` and
 * `cancelled` are terminal and carry a resolution. There is no state that is
 * neither swept nor settled — which is the same sentence as "funds cannot be
 * stranded", written as a graph.
 */

export const TRADE_STATUSES = ['created', 'escrowed', 'fiat_sent', 'released', 'cancelled', 'disputed'] as const;
export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const TRADE_RESOLUTIONS = ['released', 'refunded', 'voided'] as const;
export type TradeResolution = (typeof TRADE_RESOLUTIONS)[number];

/** Terminal states. A trade here has a resolution and never moves again. */
export const TERMINAL_STATUSES: ReadonlySet<TradeStatus> = new Set<TradeStatus>(['released', 'cancelled']);

/**
 * States in which the ledger's `escrow` account definitely holds this trade's
 * value. Entering any of them requires `escrowLock` to have returned success.
 *
 * This set is why a spurious refund cannot drain another trade's escrow: the
 * refund path is unreachable from `created`, and `created` is the only state a
 * trade can be in when the lock has not provably happened.
 */
export const ESCROW_HOLDING_STATUSES: ReadonlySet<TradeStatus> = new Set<TradeStatus>(['escrowed', 'fiat_sent', 'disputed']);

export function isTerminal(status: TradeStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function holdsEscrow(status: TradeStatus): boolean {
  return ESCROW_HOLDING_STATUSES.has(status);
}

/**
 * The complete edge list. Anything not here is not a transition, and
 * `assertTransition` is the only way a status column is ever written.
 */
const EDGES: Readonly<Record<TradeStatus, readonly TradeStatus[]>> = {
  // The escrow lock succeeded, or the trade dies having locked nothing.
  created: ['escrowed', 'cancelled'],
  // Buyer marks paid, either party walks away, or someone escalates.
  //
  // `escrowed → released` is included on purpose: a seller who watches the fiat
  // land before the buyer remembers to press "I've paid" is entitled to release.
  // It only ever gives away the actor's own escrowed asset, so there is no
  // counterparty to protect from it — and forcing the seller to wait for a
  // button the buyer may never press is how a trade ends up in the timeout path
  // it did not need.
  escrowed: ['fiat_sent', 'released', 'cancelled', 'disputed'],
  // Seller confirms, seller refunds voluntarily, or it goes to a moderator.
  fiat_sent: ['released', 'cancelled', 'disputed'],
  // A moderator has exactly two options. There is deliberately no third.
  disputed: ['released', 'cancelled'],
  released: [],
  cancelled: [],
};

export class TradeStateError extends Error {
  constructor(
    message: string,
    readonly code: 'p2p.invalid_transition' | 'p2p.trade_terminal',
    readonly from: TradeStatus,
    readonly to: TradeStatus,
  ) {
    super(message);
    this.name = 'TradeStateError';
  }
}

export function canTransition(from: TradeStatus, to: TradeStatus): boolean {
  return EDGES[from].includes(to);
}

export function assertTransition(from: TradeStatus, to: TradeStatus): void {
  if (canTransition(from, to)) return;

  if (isTerminal(from)) {
    // The message names the terminal state on purpose: "already released" and
    // "already refunded" are different incidents, and a caller retrying a
    // release needs to know which one it hit.
    throw new TradeStateError(
      `Trade is already ${from} — its escrow reached a terminal state and cannot move again`,
      'p2p.trade_terminal',
      from,
      to,
    );
  }

  throw new TradeStateError(`Cannot move a trade from ${from} to ${to}`, 'p2p.invalid_transition', from, to);
}

/**
 * The resolution that a given terminal status must carry.
 *
 * `cancelled` is the one that needs a choice, and the choice is not cosmetic:
 * `refunded` posts `escrowRefund`, `voided` posts nothing at all. Getting it
 * wrong in the `voided` direction strands the seller's asset; getting it wrong
 * in the `refunded` direction pays the seller out of somebody else's escrow.
 */
export function resolutionFor(status: TradeStatus, lockHappened: boolean): TradeResolution {
  if (status === 'released') return 'released';
  if (status === 'cancelled') return lockHappened ? 'refunded' : 'voided';
  throw new TradeStateError(`${status} is not a terminal status`, 'p2p.invalid_transition', status, status);
}

// ── Deadlines ────────────────────────────────────────────────────────────────

/**
 * Every live state's clock, in seconds. Each one is the answer to "if both
 * humans walk away right now, what resolves this trade?"
 */
export interface DeadlinePolicy {
  /** `created` → the take never finished escrowing. Short: nothing is locked yet. */
  readonly escrowSeconds: number;
  /** `escrowed` → the buyer never marked the fiat sent. Refunds the seller. */
  readonly paymentSeconds: number;
  /** `fiat_sent` → the seller never confirmed. Opens a dispute; never auto-releases. */
  readonly releaseSeconds: number;
  /** `disputed` → no moderator ruled. The backstop rules instead. */
  readonly disputeSeconds: number;
}

export const DEFAULT_DEADLINES: DeadlinePolicy = {
  escrowSeconds: 120,
  paymentSeconds: 15 * 60,
  releaseSeconds: 30 * 60,
  disputeSeconds: 7 * 24 * 60 * 60,
};

/** The full deadline record stored in `p2p_trades.deadlines` (§6.2 jsonb). */
export interface Deadlines {
  escrowBy?: string;
  paymentBy?: string;
  releaseBy?: string;
  disputeBy?: string;
}

export function deadlineFor(status: TradeStatus, from: Date, policy: DeadlinePolicy): Date | null {
  switch (status) {
    case 'created':
      return new Date(from.getTime() + policy.escrowSeconds * 1000);
    case 'escrowed':
      return new Date(from.getTime() + policy.paymentSeconds * 1000);
    case 'fiat_sent':
      return new Date(from.getTime() + policy.releaseSeconds * 1000);
    case 'disputed':
      return new Date(from.getTime() + policy.disputeSeconds * 1000);
    case 'released':
    case 'cancelled':
      // Terminal. The database refuses a deadline here, so the sweeper cannot
      // pick up a trade it would try to resolve twice.
      return null;
  }
}

export const DEADLINE_KEY: Readonly<Record<TradeStatus, keyof Deadlines | null>> = {
  created: 'escrowBy',
  escrowed: 'paymentBy',
  fiat_sent: 'releaseBy',
  disputed: 'disputeBy',
  released: null,
  cancelled: null,
};

/** Merge a new state's deadline into the record without losing the history. */
export function withDeadline(existing: Deadlines, status: TradeStatus, at: Date | null): Deadlines {
  const key = DEADLINE_KEY[status];
  if (!key || !at) return existing;
  return { ...existing, [key]: at.toISOString() };
}

/**
 * What a timeout does, per state. This table IS the guarantee that a trade
 * cannot sit in escrow forever — every live state maps to an action, and none
 * of them map to "wait longer".
 */
export type TimeoutAction = 'settle_or_void' | 'refund' | 'open_dispute' | 'backstop_resolve';

export function timeoutActionFor(status: TradeStatus): TimeoutAction | null {
  switch (status) {
    case 'created':
      // Re-drive the lock first (it is idempotent), then unwind whatever we find.
      return 'settle_or_void';
    case 'escrowed':
      // The buyer never claimed to pay. The seller's asset goes home.
      return 'refund';
    case 'fiat_sent':
      // The buyer says paid, the seller has not confirmed. That is a genuine
      // conflict between two people, not a stall — auto-releasing here would
      // hand the asset to anyone willing to press a button and wait 30 minutes.
      return 'open_dispute';
    case 'disputed':
      return 'backstop_resolve';
    case 'released':
    case 'cancelled':
      return null;
  }
}
