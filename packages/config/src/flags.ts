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

const DROP_ORDER: Readonly<Record<Drop, number>> = { '0': 0, I: 1, II: 2, III: 3, IV: 4, V: 5 };

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

function envOverride(key: string, env: Record<string, string | undefined>): boolean | undefined {
  // waitlist.enabled -> INTAFACED_FLAG_WAITLIST_ENABLED
  const name = `INTAFACED_FLAG_${key.replace(/[.-]/g, '_').toUpperCase()}`;
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

export function flagsForModule(module: ModuleId): FlagDef[] {
  return FLAG_REGISTRY.filter((f) => f.module === module);
}

export function flagDef(key: string): FlagDef | undefined {
  return BY_KEY.get(key);
}
