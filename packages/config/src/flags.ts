import type { ModuleId } from './modules.js';

/**
 * Feature flags — §11: "Everything ships dark behind flags; the drop sequence
 * is configuration, not deployment risk."
 *
 * A flag turns on when the current LAUNCH_DROP has reached the flag's drop,
 * unless an explicit override says otherwise. Overrides come from (in order of
 * precedence): explicit `overrides` argument > env `INTAFACED_FLAG_<NAME>=on|off`.
 *
 * Kill-switches (§14 DoD "Admin controls") are the same mechanism pointed the
 * other way: `module.<id>.enabled` defaults on, and admin sets it off.
 */

export const DROPS = ['0', 'I', 'II', 'III', 'IV', 'V'] as const;
export type Drop = (typeof DROPS)[number];

/**
 * Exported, because comparing two drops is something callers legitimately need
 * and the obvious workaround is a trap: `'0' | 'I' | 'II' | 'III' | 'IV' | 'V'`
 * happens to sort correctly lexicographically, right up until someone adds
 * drop 'VI' — which sorts before 'V'.
 */
export const DROP_ORDER: Readonly<Record<Drop, number>> = { '0': 0, I: 1, II: 2, III: 3, IV: 4, V: 5 };

/** Negative when `a` comes first. Use this rather than comparing the strings. */
export function compareDrops(a: Drop, b: Drop): number {
  return DROP_ORDER[a] - DROP_ORDER[b];
}

/**
 * The §11 launch-sequence names.
 *
 * They live here rather than only in the build doc so the admin console and the
 * doctrine cannot drift — an operator staring at "III" needs to know that is
 * Soft launch.
 */
export const DROP_NAMES: Readonly<Record<Drop, string>> = {
  '0': 'Tease',
  I: 'Blueprint',
  II: 'Lobby preview',
  III: 'Soft launch',
  IV: 'Public drop',
  V: 'Seasons',
};

export interface FlagDef {
  readonly key: string;
  readonly module: ModuleId;
  /** Earliest drop at which this flag defaults to on. `null` = never by default. */
  readonly drop: Drop | null;
  readonly description: string;
}

function def(key: string, module: ModuleId, drop: Drop | null, description: string): FlagDef {
  return { key, module, drop, description };
}

/** §11 LAUNCH-SEQUENCE MAPPING — the table, as code. */
export const FLAG_REGISTRY: readonly FlagDef[] = [
  // Drop 0 · Tease
  def('waitlist.enabled', 'core-ops', '0', 'Waitlist capture + referral queue'),
  def('referral.queue', 'core-ops', '0', 'Referral position mechanics'),
  def('mining.testnet', 'mining-pool', '0', 'PoW pool in testnet mode'),

  // Drop I · Blueprint
  def('blueprint.onboarding', 'blueprint', 'I', 'Identity Blueprint onboarding session'),
  def('blueprint.cardShare', 'blueprint', 'I', 'Blueprint card render + share'),
  def('launch.foundingBadges', 'launch', 'I', 'Founding badge NFT mint'),
  def('token.paperPublished', 'token', 'I', 'Token paper public'),

  // Drop II · Lobby preview
  def('academy.inviteLobbies', 'academy', 'II', 'Invite-only preview lobbies'),
  def('mining.mainnet', 'mining-pool', 'II', 'PoW pool on mainnet'),
  def('bank.cardWaitlist', 'bank', 'II', 'Card waitlist capture'),

  // Drop III · Soft launch
  def('identity.rankedWaves', 'identity', 'III', 'Ranked onboarding waves'),
  def('launch.memeFactory', 'launch', 'III', 'Meme factory one-click launches'),
  def('edge.gateway', 'edge', 'I', 'Public API gateway accepts traffic'),
  def('trade.spot', 'trade', 'III', 'Spot order book live'),

  // Drop IV · Public drop
  def('platform.open', 'identity', 'IV', 'Fully open registration'),
  def('token.tge', 'token', 'IV', 'TGE + listing'),
  def('token.staking', 'token', 'IV', 'Staking live'),
  def('academy.tournament', 'academy', 'IV', 'Tournament engine'),

  // Drop V · Seasons
  def('identity.seasonEngine', 'identity', 'V', 'Seasonal XP + ladders'),
  def('launch.limitedDrops', 'launch', 'V', 'Limited drops'),

  // Core — always on, switchable only by an operator in an emergency.
  // `ledger.posting` is the most consequential switch in the platform: §4.2
  // requires that a reconciliation mismatch freezes writes rather than letting
  // a book we cannot verify keep accepting them.
  def('ledger.posting', 'ledger', '0', 'Ledger accepts posts — OFF freezes all value movement platform-wide'),
  def('ledger.reconciliation', 'ledger', '0', 'Hourly snapshot + replay reconciliation job'),
  def('matching.engine', 'matching', null, 'Order matching engine accepts orders'),

  // Not on the drop clock — gated by build phase / licensing (§13 sockets)
  def('trade.futures', 'trade', null, 'Perp futures markets'),
  def('trade.options', 'trade', null, 'Options markets (v1: full-collateral)'),
  def('trade.copyTrading', 'trade', null, 'Copy trading + profit share'),
  def('trade.otc', 'trade', null, 'OTC RFQ desk (staked gate)'),
  def('pay.payfac', 'pay', null, 'PayFac sub-merchant trees'),
  def('pay.laneA', 'pay', null, 'Permissionless crypto rails (§24 Lane A)'),
  def('p2p.sovereignEscrow', 'p2p', null, 'Contract escrow (Protocol Plane)'),
  def('bank.loans', 'bank', null, 'Collateralised loans'),
  def('bank.cards', 'bank', null, 'Card issuance'),
  def('bank.sovereignCard', 'bank', null, 'Self-custody funded card (§18)'),
  def('protocol.smartAccounts', 'protocol', null, 'Passkey smart accounts (§17.4)'),
  def('protocol.amm', 'protocol', null, 'AMM pools'),
  def('protocol.lending', 'protocol', null, 'On-chain lending markets'),
  def('chain.mainnet', 'chain', null, 'INTACHAIN mainnet'),
  def('bridge.enabled', 'bridge', null, 'Fiat ↔ Protocol plane bridge'),
  def('launch.rwa', 'launch', null, 'RWA issuance (licence-gated, §13)'),
  def('agents.premiumTiers', 'agents', null, 'Metered premium agent tiers'),

  // Every module needs at least one flag, because §14's DoD requires a
  // kill-switch and the gate checks for exactly that. `market` and `indexer`
  // had none — meaning both services would have shipped with a Definition of
  // Done that could never pass. Found by the admin console, which surfaced
  // "modules with no kill-switch" as a panel.
  def('market.listings', 'market', null, 'Vendor marketplace open for listings and purchases'),
  def('market.vendorApplications', 'market', null, 'Accepting new vendor applications'),
  def('indexer.ingest', 'indexer', null, 'Chain → Postgres read-model ingestion'),
];

export const FLAG_KEYS = FLAG_REGISTRY.map((f) => f.key);
export type FlagKey = (typeof FLAG_REGISTRY)[number]['key'];

const BY_KEY = new Map(FLAG_REGISTRY.map((f) => [f.key, f]));

export interface FlagContext {
  readonly drop: Drop;
  /** Explicit on/off overrides — admin console, tests, per-env config. */
  readonly overrides?: Readonly<Record<string, boolean>>;
  /** Modules switched off by the operator kill-switch (§14). */
  readonly disabledModules?: readonly ModuleId[];
  readonly env?: Record<string, string | undefined>;
}

/** `waitlist.enabled` → `INTAFACED_FLAG_WAITLIST_ENABLED`. */
export function envVarNameFor(key: string): string {
  return `INTAFACED_FLAG_${key.replace(/[.-]/g, '_').toUpperCase()}`;
}

function envOverride(key: string, env: Record<string, string | undefined>): boolean | undefined {
  const name = envVarNameFor(key);
  const raw = env[name];
  if (raw === undefined) return undefined;
  return ['1', 'true', 'on', 'yes'].includes(raw.toLowerCase());
}

export class UnknownFlagError extends Error {
  constructor(key: string) {
    super(`Unknown feature flag "${key}". Declare it in FLAG_REGISTRY (packages/config/src/flags.ts).`);
    this.name = 'UnknownFlagError';
  }
}

/**
 * Resolve one flag. Unknown keys throw — there are no ad-hoc flags, because an
 * undeclared flag is an undocumented launch dependency.
 */
export function isEnabled(key: string, ctx: FlagContext): boolean {
  const flag = BY_KEY.get(key);
  if (!flag) throw new UnknownFlagError(key);

  // A module kill-switch beats everything. Operator safety is not overridable.
  if (ctx.disabledModules?.includes(flag.module)) return false;

  const explicit = ctx.overrides?.[key];
  if (explicit !== undefined) return explicit;

  const fromEnv = envOverride(key, ctx.env ?? {});
  if (fromEnv !== undefined) return fromEnv;

  if (flag.drop === null) return false;
  return DROP_ORDER[ctx.drop] >= DROP_ORDER[flag.drop];
}

/** Snapshot of every flag — what apps/admin renders, and what CI asserts against. */
export function resolveAll(ctx: FlagContext): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of FLAG_REGISTRY) out[f.key] = isEnabled(f.key, ctx);
  return out;
}

/** Why a flag is in the state it is in. Ordered by the precedence in `isEnabled`. */
export type FlagSource =
  /** A module kill-switch is holding it off. Beats everything. */
  | 'kill-switch'
  /** An explicit override was passed in — admin console, test, per-env config. */
  | 'override'
  /** An INTAFACED_FLAG_* environment variable pinned it. */
  | 'env'
  /** The drop clock reached it. */
  | 'drop'
  /** Its drop has not arrived yet. */
  | 'drop-pending'
  /** `drop: null` — gated by build phase or licensing, never by the clock. */
  | 'phase-gated';

export interface FlagExplanation {
  readonly key: string;
  readonly enabled: boolean;
  readonly source: FlagSource;
  /** One sentence an operator can act on. */
  readonly reason: string;
  readonly module: ModuleId;
  readonly drop: Drop | null;
}

/**
 * Why is this flag on or off?
 *
 * `isEnabled` answers *whether*; an operator staring at a board of booleans
 * needs *why*. Without provenance you cannot tell whether a flag is on because
 * the drop clock reached it, because an env var pins it, or off because a
 * module kill-switch is holding it — and an operator who cannot see that flips
 * the wrong switch.
 *
 * Deliberately mirrors `isEnabled`'s precedence exactly. If the two ever
 * disagree, `isEnabled` is authoritative and this is the bug — there is a test
 * asserting they agree across every flag and a spread of contexts.
 */
export function explain(key: string, ctx: FlagContext): FlagExplanation {
  const flag = BY_KEY.get(key);
  if (!flag) throw new UnknownFlagError(key);

  const base = { key, module: flag.module, drop: flag.drop };

  if (ctx.disabledModules?.includes(flag.module)) {
    return { ...base, enabled: false, source: 'kill-switch', reason: `module "${flag.module}" is killed by the operator` };
  }

  const explicit = ctx.overrides?.[key];
  if (explicit !== undefined) {
    return { ...base, enabled: explicit, source: 'override', reason: `explicitly overridden ${explicit ? 'on' : 'off'}` };
  }

  const fromEnv = envOverride(key, ctx.env ?? {});
  if (fromEnv !== undefined) {
    return {
      ...base,
      enabled: fromEnv,
      source: 'env',
      reason: `pinned ${fromEnv ? 'on' : 'off'} by ${envVarNameFor(key)}`,
    };
  }

  if (flag.drop === null) {
    return { ...base, enabled: false, source: 'phase-gated', reason: 'gated by build phase, not by the drop clock (§13)' };
  }

  const reached = DROP_ORDER[ctx.drop] >= DROP_ORDER[flag.drop];
  return reached
    ? { ...base, enabled: true, source: 'drop', reason: `drop ${flag.drop} (${DROP_NAMES[flag.drop]}) has been reached` }
    : { ...base, enabled: false, source: 'drop-pending', reason: `waiting for drop ${flag.drop} (${DROP_NAMES[flag.drop]})` };
}

export function explainAll(ctx: FlagContext): FlagExplanation[] {
  return FLAG_REGISTRY.map((f) => explain(f.key, ctx));
}

/** Modules with no flag at all — nothing for an operator to switch off (§14). */
export function modulesWithoutKillSwitch(allModules: readonly ModuleId[]): ModuleId[] {
  const covered = new Set(FLAG_REGISTRY.map((f) => f.module));
  return allModules.filter((m) => !covered.has(m));
}

export function flagsForModule(module: ModuleId): FlagDef[] {
  return FLAG_REGISTRY.filter((f) => f.module === module);
}

export function flagDef(key: string): FlagDef | undefined {
  return BY_KEY.get(key);
}
