/**
 * OPERATOR COMMAND STUBS — ledger ops (§14.6 admin controls).
 *
 * These mirror, one for one, the `admin:treasury` procedures that already exist
 * on `services/svc-ledger/src/router.ts`:
 *
 *   ledger.freeze    { reason: string }  -> { postingEnabled: false }
 *   ledger.unfreeze  ()                  -> { postingEnabled: true }
 *   ledger.reconcile ()                  -> { ok, accountsChecked, chainLength, unbalancedAssets }
 *
 * They do NOT call them. svc-ledger is not deployed and this console holds no
 * service credential to present, so every function here records the operator's
 * intent and returns a clearly-marked simulated result. Nothing in this file
 * moves value; nothing in this app computes a balance.
 *
 * LIVE WIRING (§13 socket — `apps/admin` → `svc-ledger`): replace each body
 * with a tRPC client call against `LedgerRouter`, carrying the operator's
 * `admin:treasury` scope from `@intafaced/auth`. The signatures below are
 * already the router's input/output shapes, so the swap is body-only. Until
 * that lands, every screen that renders these results says so on its face.
 */

export type CommandKind = 'freeze' | 'unfreeze' | 'reconcile';

export interface CommandIntent {
  readonly id: string;
  readonly kind: CommandKind;
  readonly at: string;
  readonly detail: string;
  /** False until the tRPC client above replaces these bodies. */
  readonly delivered: false;
}

export interface FreezeInput {
  /** `svc-ledger` requires a non-empty reason; this console requires a useful one. */
  readonly reason: string;
}

export interface PostingStatus {
  readonly postingEnabled: boolean;
}

export interface ReconcileReport {
  readonly ok: boolean;
  readonly accountsChecked: number;
  readonly chainLength: number;
  readonly unbalancedAssets: readonly string[];
}

let sequence = 0;

function record(kind: CommandKind, detail: string): CommandIntent {
  sequence += 1;
  const intent: CommandIntent = {
    id: `${kind}-${sequence}`,
    kind,
    at: new Date().toISOString(),
    detail,
    delivered: false,
  };
  // The audit trail is the point. When this is wired, the same line becomes the
  // client-side half of the record svc-ledger writes on the other end.
  console.warn('[operator-intent] NOT DELIVERED — svc-ledger is not deployed', intent);
  return intent;
}

export interface CommandResult<T> {
  readonly intent: CommandIntent;
  readonly simulated: T;
}

/**
 * HALTS ALL VALUE MOVEMENT PLATFORM-WIDE. Every module posts through the
 * ledger, so a freeze stops trade fills, payouts, escrow releases, card
 * authorisations and settlement at once (§4.2).
 */
export function freezeLedger(input: FreezeInput): CommandResult<PostingStatus> {
  return { intent: record('freeze', `reason: ${input.reason}`), simulated: { postingEnabled: false } };
}

export function unfreezeLedger(): CommandResult<PostingStatus> {
  return { intent: record('unfreeze', 'posting re-enabled'), simulated: { postingEnabled: true } };
}

/**
 * Read-only on the ledger's side: snapshot + replay, then compare. §4.2 says a
 * mismatch freezes writes rather than letting an unverifiable book keep
 * accepting them — so a non-ok report is a freeze decision, not a warning.
 */
export function reconcileLedger(): CommandResult<ReconcileReport> {
  return {
    intent: record('reconcile', 'snapshot + replay requested'),
    simulated: { ok: false, accountsChecked: 0, chainLength: 0, unbalancedAssets: [] },
  };
}
