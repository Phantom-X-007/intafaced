import { MemoryChain, UnconfiguredChain, type CryptoChainPort } from './chain-port.js';
import { VALUE_LEAVING_CAPABILITIES, type RailAdapter, type RailCapability } from './rail-adapter.js';
import type { RailRegistry } from './registry.js';

/**
 * RAIL POSTURE — is this deployment allowed to move real money through a rail
 * that is not real?
 *
 * WHY THIS FILE EXISTS. svc-pay shipped with `MemoryChain` wired into
 * `index.ts` unconditionally and `card-sandbox` registered beside it. Both
 * declare `payout`. `withdrawal.create` takes `railId` from the caller and
 * resolves it through `rails.require(railId, 'payout')`, so on any deployment —
 * including a production one — a user could withdraw through a rail whose
 * counterparty is a `Map`. The path would have debited their real ledger
 * balance, written a made-up provider reference into `withdrawals.rail_ref`,
 * posted `withdrawSettle`, and answered `status: 'sent'`.
 *
 * THAT IS THE WORST AVAILABLE BUG IN THIS SERVICE, and it is worse than it
 * sounds, because it is invisible from the inside. Every invariant holds: the
 * journal balances, the boundary account carries the obligation, the double
 * entry is perfect. The only thing missing is the money, and the only thing that
 * would ever notice is a reconciliation against real custody — which is a job
 * that runs later, if at all, and by then the user has been told for days that
 * their withdrawal was sent.
 *
 * THE ANSWER IS MODELLED ON `assertScreeningConfigured` (packages/config), and
 * on purpose: a property the platform claims is asserted at startup, the process
 * refuses to run rather than quietly mislead users about it, and `dev`/`test`
 * are deliberately frictionless because nobody should need a sponsor bank to run
 * a unit test.
 *
 * TWO GATES, NOT ONE:
 *
 *   1. BOOT (`assertRailPosture`) — an enforced environment with a sandbox rail
 *      registered refuses to start. Loud, early, and impossible to miss.
 *   2. RUNTIME (`assertRailMayMoveValue`) — the payout/refund call sites check
 *      again. Boot configuration drifts, adapters get added by later code, and a
 *      guard that only runs once is a guard that only used to run.
 */

/**
 * APP_ENVs where a sandbox rail moving value is a refusal.
 *
 * `staging` is included for the same reason screening includes it: it is a
 * production-like posture reachable by real people, and it is where a dishonest
 * default gets normalised before it reaches prod.
 */
export const RAIL_POSTURE_ENFORCED_ENVS = ['staging', 'prod'] as const;

export type ValueMovementPolicy = 'live-only' | 'allow-sandbox';

export interface RailPosture {
  readonly appEnv: string;
  readonly policy: ValueMovementPolicy;
  /** True when an operator deliberately overrode the refusal. */
  readonly sandboxOverride: boolean;
}

export interface RailPostureStatus {
  readonly policy: ValueMovementPolicy;
  readonly live: readonly string[];
  readonly sandbox: readonly string[];
  /** One line an operator can read in a log, on `/ready`, or on a dashboard. */
  readonly summary: string;
}

/**
 * Which rails are real, said out loud.
 *
 * Exists because "how many rails are registered" and "how many rails can
 * actually send money" are different questions, and the answer to both used to
 * be an indistinguishable two.
 */
export function railPostureStatus(rails: RailRegistry, policy: ValueMovementPolicy = 'allow-sandbox'): RailPostureStatus {
  const live = rails
    .list()
    .filter((a) => a.mode === 'live')
    .map((a) => a.id);
  const sandbox = rails
    .list()
    .filter((a) => a.mode === 'sandbox')
    .map((a) => a.id);

  const summary =
    sandbox.length === 0
      ? `rails: ${live.length} live [${live.join(', ')}], 0 sandbox`
      : `rails: ${live.length} live [${live.join(', ') || '—'}], ${sandbox.length} SANDBOX [${sandbox.join(', ')}] — ` +
        (policy === 'live-only'
          ? 'sandbox rails are refused for payout and refund'
          : 'SANDBOX RAILS MAY MOVE VALUE. A payout here returns a fabricated reference and nothing leaves.');

  return { policy, live, sandbox, summary };
}

export class SandboxRailError extends Error {
  constructor(
    readonly appEnv: string,
    readonly sandboxRails: readonly string[],
  ) {
    super(
      `SANDBOX RAILS ARE REGISTERED AND APP_ENV=${appEnv}. Refusing to start.\n\n` +
        `Sandbox rails: ${sandboxRails.join(', ')}\n\n` +
        `Each of these declares \`payout\`, and each has a SIMULATED counterparty. A withdrawal or a ` +
        `merchant payout routed to one of them debits a real ledger balance, returns a provider ` +
        `reference this codebase invented, and reports success. The user is told their money moved. ` +
        `Nothing moved.\n\n` +
        `The books will balance perfectly while this is happening — double entry is satisfied by a ` +
        `fabricated settlement exactly as well as by a real one. The only figure that can tell them ` +
        `apart is the rail boundary account reconciled against actual custody, and by the time that ` +
        `job disagrees, the platform has been lying to users for however long it has been up.\n\n` +
        `THE FIX IS A LIVE RAIL, NOT A FLAG. Write an adapter with a real counterparty, pass the ` +
        `conformance kit (services/svc-pay/src/rails/conformance.ts), and register it. What the owner ` +
        `must obtain for each kind:\n` +
        `  · crypto-native — a chain node/RPC endpoint, custody of outbound signing keys, and a ` +
        `signing service that will not broadcast one business key twice. See ChainNotConfiguredError.\n` +
        `  · card acquiring — a sponsor bank / acquiring BIN. §13 lists this as a socket precisely ` +
        `because it is a commercial relationship, not code. §6.1's endgame is principal membership.\n` +
        `  · bank payout rails — a payment-institution licence or a sponsored BIN-adjacent ` +
        `arrangement, plus the provider's production credentials.\n\n` +
        `IF YOU ARE RUNNING A DELIBERATE SANDBOX in a production-like environment — a pilot, a demo ` +
        `to an investor, a load test — set PAY_ALLOW_SANDBOX_RAILS=true. It is logged at boot on ` +
        `every start, and it is an explicit statement that no user of this deployment is being told ` +
        `anything true about their money leaving.\n\n` +
        `dev and test are deliberately unaffected: the sandbox rails ARE the test fixture there.`,
    );
    this.name = 'SandboxRailError';
  }
}

/**
 * Called at boot, before the listener opens.
 *
 * Returns the posture so the caller can log it — in dev, where this does not
 * throw, the log line IS the control's visibility. Same contract as
 * `assertScreeningConfigured`.
 */
export function assertRailPosture(rails: RailRegistry, env: Record<string, string | undefined> = process.env): RailPosture {
  const appEnv = env.APP_ENV ?? 'dev';
  const enforced = (RAIL_POSTURE_ENFORCED_ENVS as readonly string[]).includes(appEnv);
  const sandboxOverride = env.PAY_ALLOW_SANDBOX_RAILS === 'true';
  const sandboxRails = rails
    .list()
    .filter((a) => a.mode === 'sandbox')
    .map((a) => a.id);

  if (enforced && !sandboxOverride && sandboxRails.length > 0) {
    throw new SandboxRailError(appEnv, sandboxRails);
  }

  return {
    appEnv,
    // An override relaxes the BOOT refusal, not the honesty of the log line.
    // The runtime policy follows the boot decision so the two cannot disagree.
    policy: enforced && !sandboxOverride ? 'live-only' : 'allow-sandbox',
    sandboxOverride: enforced && sandboxOverride,
  };
}

export class SandboxRailRefusal extends Error {
  readonly code = 'pay.rail_not_live';

  constructor(
    readonly railId: string,
    readonly capability: RailCapability,
  ) {
    super(
      `Rail "${railId}" is a SANDBOX and this deployment refuses ${capability} on a sandbox rail. ` +
        `A ${capability} here would return a provider reference nothing outside this process has ever ` +
        `seen, and the caller would be told value moved when none did. No value has been moved and no ` +
        `hold has been placed.`,
    );
    this.name = 'SandboxRailRefusal';
  }
}

/**
 * THE RUNTIME GATE. Call it before the ledger moves, never after.
 *
 * Placed at the money sites rather than inside `RailRegistry.require` so the
 * refusal is visible in the code that is about to move value — and so the
 * registry stays what its own comment says it is: a map from id to adapter that
 * does not choose between rails.
 *
 * ORDERING IS THE WHOLE POINT. This must run before `withdrawHold`. Refusing
 * after the hold is posted leaves the user's funds immobilised for a reason that
 * was knowable before anything was touched.
 */
export function assertRailMayMoveValue(adapter: RailAdapter, capability: RailCapability, policy: ValueMovementPolicy): void {
  if (policy !== 'live-only') return;
  if (!VALUE_LEAVING_CAPABILITIES.includes(capability)) return;
  if (adapter.mode === 'live') return;
  throw new SandboxRailRefusal(adapter.id, capability);
}

/**
 * The chain to put behind `crypto-native` when nothing real is configured.
 *
 * In an enforced environment the answer is `UnconfiguredChain`, which refuses
 * every call. In dev and test it is `MemoryChain`, which is the fixture the
 * whole suite is built on.
 *
 * THIS IS THE §13 SOCKET, and the reason it takes no URL: there is no
 * implementation of `CryptoChainPort` against a real node in this repository. A
 * `PAY_CHAIN_WATCHER_URL` would read as though supplying it made the rail live,
 * and the honest shape of "not built yet" is a refusing implementation plus an
 * error message naming what the owner has to obtain — not a config key with
 * nothing behind it.
 */
export function defaultChainFor(env: Record<string, string | undefined> = process.env): CryptoChainPort {
  const appEnv = env.APP_ENV ?? 'dev';
  const enforced = (RAIL_POSTURE_ENFORCED_ENVS as readonly string[]).includes(appEnv);
  return enforced ? new UnconfiguredChain() : new MemoryChain();
}
