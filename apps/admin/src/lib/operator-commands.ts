/**
 * THE ONE OPERATOR COMMAND THAT IS STILL A STUB — ledger reconcile.
 *
 * ── What used to be here, and why it is gone ────────────────────────────────
 *
 * `freezeLedger` and `unfreezeLedger` lived in this file and returned
 * `{ postingEnabled: false }` and `{ postingEnabled: true }` without calling
 * anything. `/ledger` rendered those results, so pressing "Freeze ledger" turned
 * the posting status panel to HALTED and wrote a line into an "operator intent
 * log" — a screen that looks exactly like a platform-wide halt and is a React
 * state update.
 *
 * They are deleted rather than deprecated. `src/app/api/ledger-freeze/route.ts`
 * had been a working money-plane freeze BFF with zero callers the whole time, so
 * the console had two freeze paths — one real and unreachable, one reachable and
 * fake. Keeping both with a comment on the fake one is how the fake one gets
 * called again. `/ledger` now posts to the route.
 *
 * ── Why reconcile could not go the same way ─────────────────────────────────
 *
 * There is no route to call. `svc-ledger` exposes `ledger.reconcile` under
 * `admin:treasury` on its tRPC router, but `svc-edge` mounts only
 * `/admin/kill-switches`, `/admin/status`, `/admin/ledger/freeze` and
 * `/admin/ledger/unfreeze` (`services/svc-edge/src/control-plane.ts`). Nothing
 * in the console's reach terminates at reconcile, and adding that route is a
 * change to `services/svc-edge`, which is a separate service and a separate PR
 * (§1 of the agent protocol).
 *
 * So it stays a stub, and the rule for a stub is the rule this whole file got
 * wrong: it must be impossible to mistake its output for a result. Every field
 * below is zero, `simulated` is on the type, and `LedgerOpsView` refuses to
 * render a reconcile report without the marker beside it.
 */

export interface CommandIntent {
  readonly id: string;
  readonly at: string;
  readonly detail: string;
  /**
   * Always false, and typed as the literal so it cannot quietly become true
   * without a compile error somewhere that a reader will see.
   */
  readonly delivered: false;
}

export interface ReconcileReport {
  readonly ok: boolean;
  readonly accountsChecked: number;
  readonly chainLength: number;
  readonly unbalancedAssets: readonly string[];
}

export interface SimulatedResult<T> {
  readonly intent: CommandIntent;
  /**
   * Named `simulated`, not `result`. Every consumer has to type the word to read
   * the value, which is a small, permanent tax on rendering it as though it came
   * from the book.
   */
  readonly simulated: T;
  readonly simulatedNotice: string;
}

/** The sentence that must appear beside any rendering of a simulated result. */
export const SIMULATED_NOTICE =
  'Simulated — svc-edge exposes no reconcile route, so nothing was asked and these are not the book’s numbers.';

let sequence = 0;

/**
 * Read-only on the ledger's side when it is real: snapshot + replay, then
 * compare. §4.2 says a mismatch freezes writes rather than letting an
 * unverifiable book keep accepting them — so a non-ok report is a freeze
 * decision, not a warning.
 *
 * Until the route exists, the counts are zero because nothing was counted. They
 * are svc-ledger's real output shape, so the swap is body-only, and the console
 * shows no invented number on a money screen.
 */
export function reconcileLedger(): SimulatedResult<ReconcileReport> {
  sequence += 1;
  const intent: CommandIntent = {
    id: `reconcile-${sequence}`,
    at: new Date().toISOString(),
    detail: 'snapshot + replay requested',
    delivered: false,
  };
  console.warn('[operator-intent] NOT DELIVERED — svc-edge exposes no reconcile route', intent);
  return {
    intent,
    simulated: { ok: false, accountsChecked: 0, chainLength: 0, unbalancedAssets: [] },
    simulatedNotice: SIMULATED_NOTICE,
  };
}
