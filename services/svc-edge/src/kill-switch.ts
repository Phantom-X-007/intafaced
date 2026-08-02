import { MODULE_IDS, type ModuleId } from '@intafaced/config';
import { UPSTREAMS } from './routes.js';

/**
 * THE OPERATOR KILL-SWITCH, AT THE FRONT DOOR (§14.6).
 *
 * ── What was actually there before this file ────────────────────────────────
 *
 * `packages/config/src/flags.ts` has held a complete kill-switch model since
 * the beginning: `FlagContext.disabledModules`, and `isEnabled()` giving it
 * precedence over everything else. `services/svc-protocol/src/index.ts` exports
 * `setRelayEnabled(next)`; `services/svc-indexer/src/index.ts` exports
 * `setIngestEnabled(next)`. Both are commented "the kill-switch surface
 * `apps/admin` reaches".
 *
 * **Nothing reached them.** They are module-scope functions in a service entry
 * point, exported to a process that no other process can call. `apps/admin`
 * held its staged overrides in React state and said so on its own face:
 * "Staged changes are held in this browser session and have not been sent
 * anywhere." Every service that mirrors a flag — `TRADE_SPOT_ENABLED`,
 * `WS_GATEWAY_ENABLED`, `PROTOCOL_RELAY_ENABLED`, `EMISSIONS_ENABLED` — reads
 * it from the environment ONCE, at boot. The only way an operator could switch
 * anything off was to edit compose and restart the fleet.
 *
 * A kill-switch that requires a deploy is not a kill-switch. §14.6 asks for one
 * an operator can reach, and this is the first thing in the platform that is
 * reachable.
 *
 * ── Why the edge, and not each service ──────────────────────────────────────
 *
 * Because the edge is the one component every request already passes through,
 * and because a switch that lives in fifteen processes has to be flipped
 * fifteen times — which is exactly the property you do not want in the ninety
 * seconds when you need it.
 *
 * This does NOT replace the in-service switches. `TradeService.placeOrder`
 * still refuses when `trade.spot` is off, and it should: the edge is a
 * perimeter, and a perimeter is not a substitute for the guard on the vault.
 * Defence in depth means both, and the one that can be flipped without a deploy
 * is the one an operator can actually use.
 *
 * ── The rule that makes it a safety control rather than a trap ──────────────
 *
 * A killed module refuses NEW COMMITMENTS and keeps LETTING PEOPLE OUT. That is
 * §14's own example — "`trade.spot` disabled refuses new orders while still
 * allowing cancels" — and `services/svc-trade/src/router.ts` says the same
 * thing about its own cancel path: "An operator who has halted a market must
 * still let users out; a control that traps funds is not a safety control."
 *
 * So: reads always pass, releases always pass, everything else is refused with
 * 503. Both lists are short and explicit rather than clever — an operator
 * reading this file must be able to say what a kill does without running it.
 */

/**
 * The prefix → module map, taken from the route table's own `module` field.
 *
 * Derived from data rather than from the prefix STRING, which is the bug this
 * replaced: `/api/v1` forwards to `svc-trade` but does not spell "trade", so a
 * map built by stripping `/api/` either threw at boot or — worse — left the
 * public CCXT order path with no module and therefore un-killable. See the
 * comment on `Upstream.module` in `routes.ts`.
 */
export const MODULE_BY_PREFIX: ReadonlyMap<string, ModuleId> = new Map(UPSTREAMS.map((u) => [u.prefix, u.module] as const));

/** Prefixes longest-first, so `/api/v1` can never be shadowed by a shorter one. */
const PREFIXES_LONGEST_FIRST: readonly string[] = [...MODULE_BY_PREFIX.keys()].sort((a, b) => b.length - a.length);

/**
 * Procedure leaf names that a killed module must still serve.
 *
 * `cancel` is the whole list on purpose. Every other "release" path in the
 * platform (`payment.refund`, escrow release) either is a cancel or moves value
 * on the platform's authority rather than the user's, and widening this list is
 * a decision that belongs in a PR with an argument attached, not in a regex.
 */
export const ALWAYS_ALLOWED_PROCEDURES: readonly string[] = ['cancel'];

export interface RestRelease {
  readonly method: string;
  readonly pattern: RegExp;
  /** Why this path lets a user out. Read by a human during an incident. */
  readonly what: string;
}

/**
 * Release paths that are NOT tRPC, and the second bug this file had.
 *
 * The tRPC rule above was the entire escape hatch, and `svc-trade` serves its
 * cancels twice: `orders.cancel` over tRPC, and the CCXT REST contract that
 * every ccxt client actually uses —
 *
 *   POST   /api/v1/orders        place
 *   DELETE /api/v1/orders/:id    cancel one
 *   DELETE /api/v1/orders        cancel all (?symbol=)
 *
 * A REST path has no tRPC procedure, so `procedureOf` returned null and the
 * request fell through to "an unknown shape is a commitment" — refused. Halting
 * `trade` would have blocked `DELETE /api/v1/orders/:id`, which is a user with
 * an open order and no way to close it. That is the precise failure the
 * asymmetry exists to prevent, and it failed in the trapping direction: the
 * un-killable-prefix bug let too much through, this one let nothing out.
 *
 * Enumerated rather than generalised to "DELETE is always safe". DELETE happens
 * to be release-shaped across this platform today, but that is a fact about the
 * current routes and not a law, and a safety control should not rest on a
 * coincidence that the next REST endpoint can quietly break.
 */
export const ALWAYS_ALLOWED_REST: readonly RestRelease[] = [
  { method: 'DELETE', pattern: /^\/api\/v1\/orders\/[^/]+$/, what: 'cancel one order (CCXT REST)' },
  { method: 'DELETE', pattern: /^\/api\/v1\/orders$/, what: 'cancel all orders (CCXT REST)' },
  // Futures close + margin release — same "lets user out" rule as order cancel.
  // A kill that traps open positions is not a safety control.
  { method: 'DELETE', pattern: /^\/api\/v1\/positions\/[^/]+$/, what: 'close one futures position (CCXT REST)' },
];

export type KillReason =
  /** The module is not switched off. */
  | 'not-killed'
  /** A read commits nothing. */
  | 'read-only'
  /** A cancel or other release — a control that traps funds is not a control. */
  | 'lets-the-user-out'
  /** Refused: the operator switched this module off. */
  | 'module-killed'
  /** No route owns this path; the 404 is the proxy's job, not the switch's. */
  | 'no-route'
  /** The decision itself failed. Refused, because a safety control fails closed. */
  | 'undecidable';

export interface KillDecision {
  /** The module the request was headed for, or null for an unrouted path. */
  readonly module: ModuleId | null;
  readonly refused: boolean;
  /** Why it was allowed through a kill — for the log line, and for the test. */
  readonly reason: KillReason;
}

/**
 * The tRPC procedure a request names, or null.
 *
 * `/api/trade/trpc/orders.create` → `orders.create`. Anything that is not a
 * tRPC call has no procedure, and is treated as a commitment unless
 * `ALWAYS_ALLOWED_REST` names it.
 */
export function procedureOf(pathname: string): string | null {
  const match = /\/trpc\/([^/?]+)/.exec(pathname);
  return match?.[1] ?? null;
}

/** The leaf of a procedure path: `orders.cancel` → `cancel`. */
export function procedureLeaf(procedure: string): string {
  const parts = procedure.split('.');
  return parts[parts.length - 1] ?? procedure;
}

/**
 * One entry in the operator audit trail (§14.6).
 *
 * `previous` is the half that is easy to omit and the half an incident review
 * actually needs: "trade was killed at 04:12" does not say whether the operator
 * changed anything or re-sent a request that had already landed, and those are
 * different timelines.
 */
export interface KillSwitchAuditEntry {
  readonly at: string;
  readonly module: ModuleId;
  /** The operator's principal id. Never anonymous — `admin-api.ts` proves it. */
  readonly actor: string;
  readonly reason: string;
  readonly previous: boolean;
  readonly next: boolean;
  /** False when the request asked for the state it was already in. */
  readonly changed: boolean;
}

/**
 * In-process kill-switch state.
 *
 * IN PROCESS, AND SAID OUT LOUD: this state does not survive a restart, and a
 * second edge replica does not see it. That is a real limitation and it is the
 * honest shape of what can be built without giving the edge a datastore — which
 * `env.ts` refuses it on purpose, because the internet-facing component should
 * hold the least in the fleet.
 *
 * The failure mode is the safe one. A restarted edge comes back with every
 * module ON, which is the state the deployment was configured for; an operator
 * who killed a module and then lost the process learns that from the console,
 * which reads the state back rather than assuming it. The alternative — a
 * cached "off" that outlives the reason for it — is how a platform stays down
 * after the incident is over.
 *
 * The durable half of the platform's operator surface is the ledger's, not this
 * one: `posting_freeze` is a row, carries its own actor, and is enforced by
 * `posting_freeze_attributed_ck`. `admin-api.ts` reaches it. So the switch that
 * moves money has a durable timeline; this one has an attributed in-memory
 * timeline with the same shape, waiting on the same store.
 *
 * SOCKET §13: durable kill-switch state. When the flag store lands (the one
 * `apps/admin` has been waiting on), `KillSwitchState` becomes its client and
 * nothing else here changes: the decision function, the route map, the audit
 * entry shape and the admin surface are all independent of where the booleans
 * are kept.
 */
export class KillSwitchState {
  private readonly killed = new Set<ModuleId>();
  private readonly reasons = new Map<ModuleId, string>();
  private readonly audit: KillSwitchAuditEntry[] = [];

  /**
   * How many audit entries are retained in memory.
   *
   * Bounded because this is a long-lived process on the public edge and an
   * unbounded array fed by an authenticated endpoint is a slow memory leak. The
   * cap is generous relative to how often a human flips a market off, and the
   * WARN log line emitted per toggle is the unbounded record.
   */
  static readonly AUDIT_LIMIT = 500;

  /** Modules currently switched off, in `MODULE_IDS` order so the output is stable. */
  disabledModules(): ModuleId[] {
    return MODULE_IDS.filter((id) => this.killed.has(id));
  }

  reasonFor(module: ModuleId): string | null {
    return this.reasons.get(module) ?? null;
  }

  isKilled(module: ModuleId): boolean {
    return this.killed.has(module);
  }

  /** Newest first — an operator opening the console wants the last thing that happened. */
  auditTrail(): readonly KillSwitchAuditEntry[] {
    return [...this.audit].reverse();
  }

  /**
   * Move a switch, and record who moved it.
   *
   * The audit entry is appended BEFORE the state changes, so there is no
   * ordering in which the platform is halted and the record of the halt is
   * missing.
   */
  set(module: ModuleId, disabled: boolean, actor: string, reason: string): KillSwitchAuditEntry {
    const previous = this.killed.has(module);

    const entry: KillSwitchAuditEntry = {
      at: new Date().toISOString(),
      module,
      actor,
      reason,
      previous,
      next: disabled,
      changed: previous !== disabled,
    };

    this.audit.push(entry);
    if (this.audit.length > KillSwitchState.AUDIT_LIMIT) this.audit.shift();

    if (disabled) {
      this.killed.add(module);
      this.reasons.set(module, `${reason} (by ${actor})`);
    } else {
      this.killed.delete(module);
      this.reasons.delete(module);
    }

    return entry;
  }

  /**
   * Should this request be refused?
   *
   * Pure, and separated from the HTTP layer, because this is the rule worth
   * testing and a test that has to stand up a Fastify server to ask "does a
   * cancel still get through" is a test nobody writes.
   */
  private evaluate(pathname: string, method: string): KillDecision {
    const prefix = PREFIXES_LONGEST_FIRST.find((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!prefix) return { module: null, refused: false, reason: 'no-route' };

    const module = MODULE_BY_PREFIX.get(prefix) as ModuleId;
    if (!this.killed.has(module)) return { module, refused: false, reason: 'not-killed' };

    // A read commits nothing. tRPC queries are GET; a user watching their open
    // orders during an incident is not the problem the switch is there to solve.
    const verb = method.toUpperCase();
    if (verb === 'GET' || verb === 'HEAD') return { module, refused: false, reason: 'read-only' };

    const procedure = procedureOf(pathname);
    if (procedure && ALWAYS_ALLOWED_PROCEDURES.includes(procedureLeaf(procedure))) {
      return { module, refused: false, reason: 'lets-the-user-out' };
    }

    // Path only, never the query string: `?symbol=BTC/USDT` on a cancel-all
    // must not change whether the user is allowed out.
    const path = pathname.split('?')[0] ?? pathname;
    if (ALWAYS_ALLOWED_REST.some((r) => r.method === verb && r.pattern.test(path))) {
      return { module, refused: false, reason: 'lets-the-user-out' };
    }

    return { module, refused: true, reason: 'module-killed' };
  }

  /**
   * FAIL CLOSED.
   *
   * If deciding whether the switch is engaged throws, behave as though it is.
   * A safety control that opens when its own check errors is worse than no
   * control at all: the operator believes the market is halted, the console
   * says it is halted, and orders are being accepted. Refusing on an internal
   * error is visible, wrong in the recoverable direction, and reported as
   * `undecidable` so it can never be mistaken in the logs for a deliberate
   * operator halt.
   */
  decide(pathname: string, method: string): KillDecision {
    try {
      return this.evaluate(pathname, method);
    } catch {
      return { module: null, refused: true, reason: 'undecidable' };
    }
  }
}
