import { isHex, type Hex } from 'viem';
import { MemoryBroadcastStore, type BroadcastStore } from './broadcast-store.js';
import { MemoryChain, UnconfiguredChain, type CryptoChainPort } from './chain-port.js';
import { parseEvmAssets } from './evm-assets.js';
import { EvmLiveChain } from './evm-chain.js';
import { VALUE_LEAVING_CAPABILITIES, isUsable, type RailAdapter, type RailCapability } from './rail-adapter.js';
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

  /**
   * The policy for the PUBLIC HOSTED CHECKOUT — and the one thing
   * `PAY_ALLOW_SANDBOX_RAILS` does NOT relax.
   *
   * That override exists so an operator can run a pilot, a demo or a load test
   * in a production-like environment, and its documented meaning is: no USER OF
   * THIS DEPLOYMENT is being told anything true about their money. Everyone it
   * covers is inside the exercise — an operator, a tester, an investor being
   * shown a screen.
   *
   * A HOSTED CHECKOUT IS REACHABLE BY STRANGERS. The payer is not in the pilot;
   * they followed a link, they are not logged in, and they have not agreed to
   * anything. "Nobody here is being told the truth" cannot be consented to on
   * their behalf by an environment variable — so the public path follows the
   * ENVIRONMENT, not the override, and in `staging`/`prod` it is `live-only`
   * whatever the flag says.
   */
  readonly publicCheckoutPolicy: ValueMovementPolicy;
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
    // NOT `&& !sandboxOverride`. See the field's own comment: the override is a
    // statement an operator can make about the people inside their own
    // deployment, and a hosted checkout is reachable by people who are not.
    publicCheckoutPolicy: enforced ? 'live-only' : 'allow-sandbox',
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

// ── THE PUBLIC INBOUND GATE ──────────────────────────────────────────────────

export class PublicCheckoutUnavailable extends Error {
  readonly code = 'pay.checkout_rail_not_live';

  constructor(
    readonly railId: string | null,
    readonly reason: 'sandbox' | 'none-configured' | 'unhealthy',
  ) {
    super(
      (railId === null
        ? `No rail can accept a public hosted-checkout payment on this deployment (${reason}). `
        : `Rail "${railId}" cannot accept a public hosted-checkout payment on this deployment (${reason}). `) +
        `No session was opened, no payment row exists, and no payer has been shown a checkout that ` +
        `could not complete.`,
    );
    this.name = 'PublicCheckoutUnavailable';
  }
}

/**
 * STRICTER THAN `assertRailMayMoveValue`, and it has to be.
 *
 * `VALUE_LEAVING_CAPABILITIES` deliberately excludes `authorize` and `capture`,
 * and the reasoning in `rail-adapter.ts` is sound as far as it goes: a sandbox
 * capture leaves the PLATFORM short, reconciliation against the rail boundary is
 * exactly the figure that catches it, and nobody has been told their own money
 * left.
 *
 * THAT REASONING ASSUMES THE PAYER IS THE MERCHANT'S OWN INTEGRATION — a
 * merchant server calling `payment.create` with a rail id it chose, on a
 * deployment whose posture it knows. Every part of that assumption fails on a
 * hosted checkout:
 *
 *   · The payer is an anonymous third party who agreed to nothing and is shown
 *     "paid" by a page carrying our name.
 *   · The merchant is credited clearing they can settle and then withdraw, so a
 *     fabricated inbound becomes a real outbound one hop later.
 *   · Nobody in the loop can see which rail was used, or what mode it was in.
 *
 * So on the public surface a sandbox rail is refused under the same `live-only`
 * policy that refuses a sandbox payout. One boot decision, two call sites, and
 * no second route around the P0.
 *
 * CALLED BEFORE THE SESSION ROW EXISTS, never after — a payer must not be shown
 * a checkout that cannot possibly complete, and refusing before anything is
 * written leaves nothing to reconcile.
 */
export function assertRailMayAcceptPublicPayment(adapter: RailAdapter, policy: ValueMovementPolicy): void {
  if (policy !== 'live-only') return;
  if (adapter.mode === 'live') return;
  throw new PublicCheckoutUnavailable(adapter.id, 'sandbox');
}

/**
 * What a rail must be able to do before a public checkout may point at it.
 *
 * `webhook` is the load-bearing entry. A hosted checkout completes when the
 * RAIL says the money arrived, never when the browser says so — a rail that
 * cannot deliver a verified webhook has no way to tell us anything true, and a
 * session on it could only ever be completed by trusting the payer's own page.
 */
export const PUBLIC_CHECKOUT_CAPABILITIES: readonly RailCapability[] = ['authorize', 'capture', 'webhook'];

/**
 * Which registered rail serves a public checkout, in configured order.
 *
 * NOT ROUTING. Smart routing — geo, method, amount band, risk score, live
 * approval rates — is its own tracker feature (`pay.routing`), and when it lands
 * it replaces this function and nothing else. What this does is far dumber and
 * deliberately so: walk an operator-configured preference list and take the
 * first entry that is registered, can run the whole inbound lifecycle, is
 * answering, and passes the gate above.
 *
 * THE PREFERENCE LIST IS CONFIGURATION, NEVER A REQUEST FIELD. That is the whole
 * reason this function exists rather than a `railAdapter` input: a hosted
 * checkout that can name a rail, or a payment link that resolves to one, is
 * exactly where the sandbox-withdrawal P0 would come back.
 */
export function selectPublicCheckoutRail(
  rails: RailRegistry,
  preference: readonly string[],
  policy: ValueMovementPolicy,
  now: Date = new Date(),
): RailAdapter {
  let sawSandbox = false;
  let sawUnhealthy = false;

  for (const railId of preference) {
    if (!rails.has(railId)) continue;
    const adapter = rails.get(railId);
    if (!PUBLIC_CHECKOUT_CAPABILITIES.every((c) => adapter.capabilities.includes(c))) continue;

    if (!isUsable(adapter, now)) {
      sawUnhealthy = true;
      continue;
    }
    try {
      assertRailMayAcceptPublicPayment(adapter, policy);
    } catch {
      sawSandbox = true;
      continue;
    }
    return adapter;
  }

  // The reason is for operators. The payer's page says "this merchant cannot
  // take payment right now" and nothing whatsoever about our rail estate.
  throw new PublicCheckoutUnavailable(null, sawSandbox ? 'sandbox' : sawUnhealthy ? 'unhealthy' : 'none-configured');
}

/**
 * The chain to put behind `crypto-native`.
 *
 * THREE STATES, still — but the live one is no longer missing from the tree:
 *
 *   1. `PAY_CRYPTO_RPC_URL` (+ chain id, mnemonic, hot key, assets) set →
 *      `EvmLiveChain` with `posture: 'live'`. crypto-native becomes a live rail.
 *   2. Enforced env (`staging`/`prod`) with nothing set → `UnconfiguredChain`
 *      (refuses every call — never a quiet MemoryChain in production).
 *   3. `dev`/`test` with nothing set → `MemoryChain` (the suite fixture).
 *
 * A partial live config (RPC without keys, keys without RPC) REFUSES TO BUILD
 * a chain — better a loud boot failure than a rail that looks live and cannot
 * pay out.
 */
/**
 * @param broadcasts Optional durable journal for live EVM sends. When omitted,
 *   live chain uses MemoryBroadcastStore (single-process only — tests / local).
 *   Production multi-replica MUST pass PostgresBroadcastStore from index boot.
 */
export function defaultChainFor(env: Record<string, string | undefined> = process.env, broadcasts?: BroadcastStore): CryptoChainPort {
  const live = tryLiveChainFromEnv(env, broadcasts);
  if (live) return live;

  const appEnv = env.APP_ENV ?? 'dev';
  const enforced = (RAIL_POSTURE_ENFORCED_ENVS as readonly string[]).includes(appEnv);
  return enforced ? new UnconfiguredChain() : new MemoryChain();
}

/**
 * Whether `card-sandbox` may be registered alongside crypto-native.
 *
 * In `staging`/`prod`, a registered sandbox rail fails boot unless
 * `PAY_ALLOW_SANDBOX_RAILS=true`. A deployment that has wired a live crypto
 * rail should not also register the sandbox acquirer by default — that would
 * force the override flag and re-open the fabricated-payout hole on the card
 * path. Dev/test keep the sandbox: it is the fixture.
 *
 * Override with `PAY_REGISTER_CARD_SANDBOX=true|false`.
 */
export function shouldRegisterCardSandbox(env: Record<string, string | undefined> = process.env): boolean {
  if (env.PAY_REGISTER_CARD_SANDBOX === 'true') return true;
  if (env.PAY_REGISTER_CARD_SANDBOX === 'false') return false;
  const appEnv = env.APP_ENV ?? 'dev';
  return !(RAIL_POSTURE_ENFORCED_ENVS as readonly string[]).includes(appEnv);
}

export function tryLiveChainFromEnv(
  env: Record<string, string | undefined> = process.env,
  broadcasts?: BroadcastStore,
): EvmLiveChain | null {
  const rpcUrl = env.PAY_CRYPTO_RPC_URL?.trim();
  if (!rpcUrl) return null;

  const missing: string[] = [];
  const chainIdRaw = env.PAY_CRYPTO_CHAIN_ID?.trim();
  const mnemonic = env.PAY_CRYPTO_DEPOSIT_MNEMONIC?.trim();
  const hotKey = env.PAY_CRYPTO_HOT_WALLET_KEY?.trim();
  const assetsRaw = env.PAY_CRYPTO_ASSETS?.trim();

  if (!chainIdRaw) missing.push('PAY_CRYPTO_CHAIN_ID');
  if (!mnemonic) missing.push('PAY_CRYPTO_DEPOSIT_MNEMONIC');
  if (!hotKey) missing.push('PAY_CRYPTO_HOT_WALLET_KEY');
  if (!assetsRaw) missing.push('PAY_CRYPTO_ASSETS');

  if (missing.length > 0) {
    throw new Error(
      `PAY_CRYPTO_RPC_URL is set, but live crypto rail config is incomplete. Missing: ${missing.join(', ')}. ` +
        `Either supply all of them, or unset PAY_CRYPTO_RPC_URL to keep the ${
          (RAIL_POSTURE_ENFORCED_ENVS as readonly string[]).includes(env.APP_ENV ?? 'dev')
            ? 'UnconfiguredChain refusal'
            : 'MemoryChain sandbox'
        }.`,
    );
  }

  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`PAY_CRYPTO_CHAIN_ID must be a positive integer (got "${chainIdRaw}")`);
  }
  if (!hotKey || !isHex(hotKey) || hotKey.length !== 66) {
    throw new Error('PAY_CRYPTO_HOT_WALLET_KEY must be a 32-byte hex private key (0x + 64 hex chars)');
  }

  const minConfirmations = env.PAY_MIN_CONFIRMATIONS ? Number(env.PAY_MIN_CONFIRMATIONS) : 6;

  return new EvmLiveChain({
    rpcUrl,
    chainId,
    depositMnemonic: mnemonic!,
    hotWalletKey: hotKey as Hex,
    assets: parseEvmAssets(assetsRaw!),
    broadcasts: broadcasts ?? new MemoryBroadcastStore(),
    minConfirmations: Number.isFinite(minConfirmations) && minConfirmations >= 1 ? minConfirmations : 6,
  });
}
