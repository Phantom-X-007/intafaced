import { MODULE_IDS, isModuleId, type ModuleId } from '@intafaced/config';
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
 * `WS_GATEWAY_ENABLED`, `PROTOCOL_RELAY_ENABLED` — reads it from the
 * environment ONCE, at boot. The only way an operator could switch anything off
 * was to edit compose and restart the fleet.
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
 * So: reads always pass, `cancel` always passes, everything else is refused
 * with 503. The list is deliberately short and explicit rather than a clever
 * heuristic — an operator reading this file must be able to say what a kill
 * does without running it.
 */

/** The prefix → module map, derived from the route table so the two cannot drift. */
export const MODULE_BY_PREFIX: ReadonlyMap<string, ModuleId> = new Map(
  UPSTREAMS.map((u) => {
    const id = u.prefix.replace(/^\/api\//, '');
    if (!isModuleId(id)) {
      // A route whose prefix is not a module id would silently become
      // un-killable. Loud at boot rather than absent at 3am.
      throw new Error(`svc-edge route "${u.prefix}" does not name a module in MODULE_IDS — it could never be killed`);
    }
    return [u.prefix, id] as const;
  }),
);

/**
 * Procedure leaf names that a killed module must still serve.
 *
 * `cancel` is the whole list on purpose. Every other "release" path in the
 * platform (`orders.cancel`, `payment.refund`, escrow release) either is a
 * cancel or moves value on the platform's authority rather than the user's, and
 * widening this list is a decision that belongs in a PR with an argument
 * attached, not in a regex.
 */
export const ALWAYS_ALLOWED_PROCEDURES: readonly string[] = ['cancel'];

export interface KillDecision {
  /** The module the request was headed for, or null for an unrouted path. */
  readonly module: ModuleId | null;
  readonly refused: boolean;
  /** Why it was allowed through a kill — for the log line, and for the test. */
  readonly reason: 'not-killed' | 'read-only' | 'lets-the-user-out' | 'module-killed' | 'no-route';
}

/**
 * The tRPC procedure a request names, or null.
 *
 * `/api/trade/trpc/orders.create` → `orders.create`. Anything that is not a
 * tRPC call has no procedure, and is treated as a commitment.
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
 * SOCKET §13: durable kill-switch state. When the flag store lands (the one
 * `apps/admin` has been waiting on), `KillSwitchState` becomes its client and
 * nothing else here changes: the decision function, the route map and the
 * admin surface are all independent of where the booleans are kept.
 */
export class KillSwitchState {
  private readonly killed = new Set<ModuleId>();
  private readonly reasons = new Map<ModuleId, string>();

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

  set(module: ModuleId, disabled: boolean, reason: string): void {
    if (disabled) {
      this.killed.add(module);
      this.reasons.set(module, reason);
    } else {
      this.killed.delete(module);
      this.reasons.delete(module);
    }
  }

  /**
   * Should this request be refused?
   *
   * Pure, and separated from the HTTP layer, because this is the rule worth
   * testing and a test that has to stand up a Fastify server to ask "does a
   * cancel still get through" is a test nobody writes.
   */
  decide(pathname: string, method: string): KillDecision {
    const prefix = [...MODULE_BY_PREFIX.keys()]
      .sort((a, b) => b.length - a.length)
      .find((p) => pathname === p || pathname.startsWith(`${p}/`));

    if (!prefix) return { module: null, refused: false, reason: 'no-route' };

    const module = MODULE_BY_PREFIX.get(prefix) as ModuleId;
    if (!this.killed.has(module)) return { module, refused: false, reason: 'not-killed' };

    // A read commits nothing. tRPC queries are GET; a user watching their open
    // orders during an incident is not the problem the switch is there to solve.
    if (method === 'GET' || method === 'HEAD') return { module, refused: false, reason: 'read-only' };

    const procedure = procedureOf(pathname);
    if (procedure && ALWAYS_ALLOWED_PROCEDURES.includes(procedureLeaf(procedure))) {
      return { module, refused: false, reason: 'lets-the-user-out' };
    }

    return { module, refused: true, reason: 'module-killed' };
  }
}
