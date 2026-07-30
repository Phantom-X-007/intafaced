import { z } from 'zod';
import type { ModuleId } from '@intafaced/config';
import { subject, type Verb } from './subject.js';

/**
 * THE EVENT CATALOG.
 *
 * Every subject the OS publishes is declared here with its zod payload schema
 * and version. Nothing publishes a subject that is not in this file — that is
 * what makes the bus a contract rather than a rumour mill.
 *
 * Adding an event = a contracts/events PR (§15.2), reviewed before the
 * producing service is touched.
 */

export interface EventDef<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly subject: string;
  readonly service: ModuleId;
  readonly entity: string;
  readonly verb: Verb;
  readonly version: number;
  readonly schema: TSchema;
  readonly description: string;
}

function defineEvent<TSchema extends z.ZodTypeAny>(
  service: ModuleId,
  entity: string,
  verb: Verb,
  version: number,
  schema: TSchema,
  description: string,
): EventDef<TSchema> {
  return { subject: subject(service, entity, verb), service, entity, verb, version, schema, description };
}

// ── Shared primitives ────────────────────────────────────────────────────────

/** Money is a decimal string, always. Never a JS number — 18 decimals matter. */
export const amountSchema = z.string().regex(/^-?\d+(\.\d{1,18})?$/, 'amount must be a decimal string (max 18dp)');
export const assetIdSchema = z.string().min(1).max(16);
export const userIdSchema = z.string().uuid();

// ── identity (§4.1) ──────────────────────────────────────────────────────────

export const xpEarned = defineEvent(
  'identity',
  'xp',
  'earned',
  1,
  z.object({
    userId: userIdSchema,
    sourceModule: z.string(),
    action: z.string(),
    xpDelta: z.number().int(),
    meta: z.record(z.unknown()).optional(),
  }),
  'A module awarded XP. svc-identity is the only consumer that writes rank_state.',
);

export const rankUpdated = defineEvent(
  'identity',
  'rank',
  'updated',
  1,
  z.object({
    userId: userIdSchema,
    rank: z.number().int().min(0),
    previousRank: z.number().int().min(0),
    xp: z.string(),
  }),
  'Rank recalculated. Consumers invalidate their cached perks.',
);

export const userCreated = defineEvent(
  'identity',
  'user',
  'created',
  1,
  z.object({ userId: userIdSchema, handle: z.string(), region: z.string().length(2).optional() }),
  'A sovereign account exists.',
);

export const kycApproved = defineEvent(
  'identity',
  'kyc',
  'approved',
  1,
  z.object({
    userId: userIdSchema,
    tier: z.enum(['basic', 'full', 'institutional']),
    jurisdiction: z.string().length(2),
  }),
  'Verification tier granted — limits and module access change on this signal.',
);

// ── ledger (§4.2) ────────────────────────────────────────────────────────────

export const ledgerTxPosted = defineEvent(
  'ledger',
  'tx',
  'posted',
  1,
  z.object({
    txId: z.string().uuid(),
    module: z.string(),
    reason: z.string(),
    /** Hash chain link — consumers can verify the book independently. */
    hash: z.string(),
    previousHash: z.string().nullable(),
    entries: z
      .array(
        z.object({
          accountId: z.string().uuid(),
          assetId: assetIdSchema,
          direction: z.enum(['debit', 'credit']),
          amount: amountSchema,
        }),
      )
      .min(2),
    postedAt: z.string().datetime({ offset: true }),
  }),
  'A double-entry transaction was committed. THE money event — every value movement in the OS emits exactly one.',
);

export const ledgerReconciliationFailed = defineEvent(
  'ledger',
  'reconciliation',
  'failed',
  1,
  z.object({
    accountId: z.string().uuid(),
    assetId: assetIdSchema,
    snapshotBalance: amountSchema,
    replayBalance: amountSchema,
    drift: amountSchema,
    module: z.string(),
  }),
  'Snapshot and entry replay disagree. Pages the operator and freezes the diverging module (§4.2).',
);

/**
 * ONE subject for both directions, deliberately.
 *
 * `VERBS` is a closed list and holds no honest past tense for un-freezing, so
 * the alternative was either widening the event vocabulary or publishing a
 * thaw on a subject named `.frozen` — a subject that lies about its payload.
 *
 * The better reason is the consumer's: an alerting consumer subscribed to a
 * freeze-only subject would raise the alarm and never learn it was cleared.
 * One subject carrying the state means nothing can subscribe to half of it.
 */
export const ledgerFreezeUpdated = defineEvent(
  'ledger',
  'freeze',
  'updated',
  1,
  z.object({
    frozen: z.boolean(),
    /** Null only when `frozen` is false — an unexplained freeze is unactionable. */
    reason: z.string().min(1).nullable(),
    /**
     * WHO. An operator's principal id, `reconciliation` for the automatic
     * self-freeze, or `env:LEDGER_POSTING_ENABLED` for a boot-time freeze.
     * Never anonymous: the most consequential switch in the OS must always
     * name the thing that threw it.
     */
    actor: z.string().min(1),
    changedAt: z.string().datetime({ offset: true }),
  }),
  'Ledger posting was frozen or thawed. Durable state, not a process signal — every replica reads the same row (§4.2).',
);

// ── token (§4.3) ─────────────────────────────────────────────────────────────

export const stakeCreated = defineEvent(
  'token',
  'stake',
  'created',
  1,
  z.object({
    stakeId: z.string().uuid(),
    userId: userIdSchema,
    amount: amountSchema,
    tier: z.enum(['flex', 'm3', 'm12']),
    unlocksAt: z.string().datetime({ offset: true }).nullable(),
  }),
  'Stake opened — gates launchpad allocations, OTC access, premium lobbies, vendor slots.',
);

export const buybackExecuted = defineEvent(
  'token',
  'buyback',
  'completed',
  1,
  z.object({
    runId: z.string().uuid(),
    tokensBought: amountSchema,
    tokensBurned: amountSchema,
    tokensToRewards: amountSchema,
    revenueWindow: z.object({ from: z.string(), to: z.string() }),
  }),
  'Structural buyback & burn ran. One flywheel across both planes (§17.3).',
);

// ── bank (§8.1) ──────────────────────────────────────────────────────────────

/**
 * A margin call was raised on a collateralised loan.
 *
 * This subject exists so that RAISING a call and TELLING the borrower stay two
 * separable facts. svc-bank writes the call durably — a `loan_margin_calls` row
 * whose grace clock gates liquidation — and publishes this. Whether the borrower
 * was actually reached is svc-notify's answer, recorded per channel, and it is
 * allowed to be "no". A borrower disputing a liquidation is owed both halves of
 * that story, and a single subject meaning "borrower notified" would have
 * destroyed the second half.
 *
 * `sequence` is the per-loan call number and the business key: a redelivered
 * call 3 of loan X must not notify twice. It sits on the payload rather than
 * only in the producer's idempotency key because the CONSUMER needs to dedupe
 * on it too, and a consumer cannot see a header it was not given.
 *
 * NOT a money event — nothing moved. `cureCollateralAmount` is what the borrower
 * would have to ADD to clear the call: a decimal string, like every other amount
 * on this bus.
 */
export const bankMarginCalled = defineEvent(
  'bank',
  'margin_call',
  'created',
  1,
  z.object({
    loanId: z.string().uuid(),
    userId: userIdSchema,
    /** Per-loan call number, from 1. The business key for at-least-once delivery. */
    sequence: z.number().int().min(1),
    ltvBps: z.number().int().min(0),
    /** Collateral to ADD to return to target LTV. Not a balance, not a movement. */
    cureCollateralAmount: amountSchema,
    collateralAssetId: assetIdSchema,
    calledAt: z.string().datetime({ offset: true }),
    /** When grace ends and the liquidation ladder may act. */
    graceExpiresAt: z.string().datetime({ offset: true }),
  }),
  'A loan crossed the margin-call threshold. The call is durable at the producer whether or not anyone was reached (§8.1).',
);

// ── blueprint (§7.1) ─────────────────────────────────────────────────────────
//
// Doctrine §0.7 governs these payloads as much as any UI string: nothing here
// names the intelligence behind a profile. §10 governs their contents — no
// payload on this bus carries profile axes, birth data, or anything else
// derived from what a user told the session. Consumers that need the profile
// read it through packages/contracts under the user's own authority.

const crewRoleSchema = z.enum(['anchor', 'scout', 'builder', 'catalyst']);

export const blueprintCreated = defineEvent(
  'blueprint',
  'blueprint',
  'created',
  1,
  z.object({
    blueprintId: z.string().uuid(),
    userId: userIdSchema,
    /** Which engine build produced it. Profiles are comparable only within a version. */
    engineVersion: z.string().min(1),
    visibility: z.enum(['private', 'crew', 'public']),
  }),
  "An Identity Blueprint exists. svc-identity sets profiles.blueprint_id on this signal — svc-blueprint never writes another service's tables (§2).",
);

export const blueprintDeleted = defineEvent(
  'blueprint',
  'blueprint',
  'deleted',
  1,
  z.object({
    blueprintId: z.string().uuid(),
    userId: userIdSchema,
    erasedAt: z.string().datetime({ offset: true }),
  }),
  'Hard delete (§7.2 "deletion truly cascades"). svc-identity clears profiles.blueprint_id; every consumer drops cached profile data. Idempotent on user id.',
);

export const crewMemberCreated = defineEvent(
  'blueprint',
  'crew_member',
  'created',
  1,
  z.object({
    crewId: z.string().uuid(),
    userId: userIdSchema,
    role: crewRoleSchema,
    crewSize: z.number().int().min(1),
    matchRunId: z.string().uuid(),
  }),
  'Crew placement. svc-academy routes the lobby, svc-agents opens the crew channel.',
);

// ── matching (§5.1) ──────────────────────────────────────────────────────────

export const orderAccepted = defineEvent(
  'matching',
  'order',
  'accepted',
  1,
  z.object({ orderId: z.string().uuid(), marketId: z.string(), sequence: z.number().int() }),
  'Engine admitted an order to the book.',
);

export const orderFilled = defineEvent(
  'matching',
  'order',
  'filled',
  1,
  z.object({
    marketId: z.string(),
    makerOrderId: z.string().uuid(),
    takerOrderId: z.string().uuid(),
    price: amountSchema,
    qty: amountSchema,
    sequence: z.number().int(),
    ts: z.string().datetime({ offset: true }),
  }),
  'A match occurred. svc-trade turns this into a tradeFill ledger recipe.',
);

export const orderCancelled = defineEvent(
  'matching',
  'order',
  'cancelled',
  1,
  z.object({ orderId: z.string().uuid(), marketId: z.string(), remainingQty: amountSchema, sequence: z.number().int() }),
  'Order left the book — svc-trade releases the ledger hold.',
);

/**
 * User-visible order lifecycle (svc-trade).
 *
 * Matching's `orderFilled` / `orderCancelled` are engine facts without a user
 * id. Private order streams and mobile clients need a trade-owned signal that
 * names the owner. This is that signal — not a money path, not a balance.
 */
export const orderUpdated = defineEvent(
  'trade',
  'order',
  'updated',
  1,
  z.object({
    orderId: z.string().uuid(),
    userId: z.string().uuid(),
    marketId: z.string(),
    status: z.enum(['pending', 'open', 'filled', 'cancelled', 'rejected', 'expired']),
    side: z.enum(['buy', 'sell']),
    type: z.enum(['limit', 'market']),
    qty: amountSchema,
    filledQty: amountSchema,
    price: amountSchema.nullable(),
    clientOrderId: z.string().nullable(),
    ts: z.string().datetime({ offset: true }),
  }),
  'svc-trade order row changed — private WS fans this to the owning principal only.',
);

/**
 * User-visible fill (svc-trade). Private streams fan this to the fill owner only.
 * Distinct from matching.order.filled (engine fact, no user id on the wire).
 */
export const fillSettled = defineEvent(
  'trade',
  'fill',
  'settled',
  1,
  z.object({
    fillId: z.string().uuid(),
    orderId: z.string().uuid(),
    userId: z.string().uuid(),
    marketId: z.string(),
    side: z.enum(['buy', 'sell']),
    liquidity: z.enum(['maker', 'taker']),
    price: amountSchema,
    qty: amountSchema,
    quoteAmount: amountSchema,
    feeAsset: z.string(),
    feeAmount: amountSchema,
    feeBps: z.number().int(),
    sequence: z.number().int(),
    ts: z.string().datetime({ offset: true }),
  }),
  'svc-trade settled a fill for a user — private WS only.',
);

// ── protocol (§17.4 · Protocol Plane, non-custodial) ─────────────────────────
//
// Every event below is an OBSERVATION of chain state, not a record of something
// the platform did. Note what none of them carry: no balance, no key material,
// no amount that moved. The Protocol Plane holds nothing, so there is nothing
// of the user's for these payloads to describe (§16.9, §22).

const evmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 20-byte hex address');
const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'must be 32 bytes of hex');
/** Wei — an integer decimal string. Never a number; 2^53 wei is 0.009 ETH. */
const weiSchema = z.string().regex(/^\d+$/, 'wei must be a non-negative integer string');

export const protocolAccountCreated = defineEvent(
  'protocol',
  'account',
  'created',
  1,
  z.object({
    chainId: z.number().int().positive(),
    account: evmAddressSchema,
    /** The user's key. The only key with power over this account. */
    owner: evmAddressSchema,
    userSalt: bytes32Schema,
    txHash: bytes32Schema,
    /** Absent for an account never linked to an INTAFACED profile — which is allowed. */
    userId: userIdSchema.optional(),
  }),
  'A self-custody smart account was deployed. The platform holds no key to it (§17.4).',
);

export const protocolSessionKeyCreated = defineEvent(
  'protocol',
  'session_key',
  'created',
  1,
  z.object({
    chainId: z.number().int().positive(),
    account: evmAddressSchema,
    sessionKey: evmAddressSchema,
    /** keccak256 of the full scope — the commitment the account stores. */
    specHash: bytes32Schema,
    validAfter: z.number().int().min(0),
    validUntil: z.number().int().positive(),
    /** A CAP on native value, in wei. Not an amount that moved. */
    spendLimitWei: weiSchema,
    targets: z.array(evmAddressSchema).min(1),
    selectors: z.array(z.string().regex(/^0x[0-9a-fA-F]{8}$/)).min(1),
    txHash: bytes32Schema,
  }),
  'The account owner granted a scoped, expiring session key. Never carries transfer power (§16.10).',
);

export const protocolSessionKeyCancelled = defineEvent(
  'protocol',
  'session_key',
  'cancelled',
  1,
  z.object({
    chainId: z.number().int().positive(),
    account: evmAddressSchema,
    sessionKey: evmAddressSchema,
    /** The owner, or the session key retiring itself. Nobody else can. */
    revokedBy: evmAddressSchema,
    txHash: bytes32Schema,
  }),
  'A session key was revoked on chain. Consumers stop routing agent execution through it.',
);

// ── agents (§8.2) ────────────────────────────────────────────────────────────

/**
 * Note what these payloads do NOT carry: no prompt, no completion text, no
 * model identifier. Doctrine §0.7 keeps third-party system names out of
 * anything that ships, and §10 keeps user content out of general stores — a
 * durable event stream is both. Consumers get the routing task, the counts and
 * the codes; anything more detailed is a query against `agent_actions` under
 * the caller's own authorisation.
 */
export const agentActionCompleted = defineEvent(
  'agents',
  'action',
  'completed',
  1,
  z.object({
    sessionId: z.string().uuid(),
    userId: userIdSchema,
    agentId: z.string(),
    sequence: z.number().int().min(0),
    kind: z.enum(['session_open', 'session_close', 'completion', 'embedding', 'tool_call', 'usage_settlement']),
    /** Routing task id — configuration, never a product name. */
    task: z.string().nullable(),
    tool: z.string().nullable(),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
  }),
  'An agent did something on a user’s behalf. The public half of the Agentic Law (§8.2).',
);

export const agentActionRejected = defineEvent(
  'agents',
  'action',
  'rejected',
  1,
  z.object({
    sessionId: z.string().uuid(),
    userId: userIdSchema,
    agentId: z.string(),
    sequence: z.number().int().min(0),
    /** Guardrail code, e.g. 'agents.tool_not_declared'. */
    refusalCode: z.string(),
    tool: z.string().nullable(),
    task: z.string().nullable(),
  }),
  'A guardrail refused an action before it ran. Compliance consumes this; so does the user’s own log.',
);

export const agentUsageSettled = defineEvent(
  'agents',
  'usage',
  'settled',
  1,
  z.object({
    sessionId: z.string().uuid(),
    userId: userIdSchema,
    windowId: z.string(),
    amount: amountSchema,
    assetId: assetIdSchema,
    /** The ledger idempotency key — the reconciliation handle. */
    chargeKey: z.string(),
  }),
  'A metered usage window was billed through the ledger (§8.2 premium agent tiers).',
);

// ── p2p (§6.2) ───────────────────────────────────────────────────────────────

export const p2pOfferCreated = defineEvent(
  'p2p',
  'offer',
  'created',
  1,
  z.object({
    offerId: z.string().uuid(),
    makerId: userIdSchema,
    side: z.enum(['buy', 'sell']),
    asset: assetIdSchema,
    fiatCurrency: z.string().length(3),
    priceType: z.enum(['fixed', 'float']),
    price: amountSchema,
    minAmount: amountSchema,
    maxAmount: amountSchema,
  }),
  'A P2P offer is live and takeable.',
);

export const p2pEscrowLocked = defineEvent(
  'p2p',
  'escrow',
  'locked',
  1,
  z.object({
    tradeId: z.string().uuid(),
    offerId: z.string().uuid(),
    sellerId: userIdSchema,
    buyerId: userIdSchema,
    asset: assetIdSchema,
    amount: amountSchema,
    fiatCurrency: z.string().length(3),
    fiatAmount: amountSchema,
    /** When the buyer must have paid by. Escrow never waits indefinitely. */
    paymentDeadline: z.string().datetime({ offset: true }),
  }),
  'Seller crypto is in escrow. The clock on this trade is now running.',
);

export const p2pEscrowReleased = defineEvent(
  'p2p',
  'escrow',
  'released',
  1,
  z.object({
    tradeId: z.string().uuid(),
    sellerId: userIdSchema,
    buyerId: userIdSchema,
    asset: assetIdSchema,
    amount: amountSchema,
    fee: amountSchema,
    resolvedBy: z.enum(['seller', 'moderator']),
    /** Seconds from escrow to release — feeds the maker's reputation. */
    releaseSeconds: z.number().int().nonnegative(),
  }),
  'Escrow released to the buyer — the trade completed.',
);

export const p2pEscrowRefunded = defineEvent(
  'p2p',
  'escrow',
  'refunded',
  1,
  z.object({
    tradeId: z.string().uuid(),
    sellerId: userIdSchema,
    buyerId: userIdSchema,
    asset: assetIdSchema,
    amount: amountSchema,
    resolvedBy: z.enum(['buyer', 'seller', 'moderator', 'timeout']),
    reason: z.string(),
  }),
  'Escrow returned to the seller — cancelled, timed out, or resolved in their favour.',
);

export const p2pTradeDisputed = defineEvent(
  'p2p',
  'trade',
  'disputed',
  1,
  z.object({
    tradeId: z.string().uuid(),
    disputeId: z.string().uuid(),
    openedBy: userIdSchema,
    reason: z.string(),
    moderatorDeadline: z.string().datetime({ offset: true }),
  }),
  'A trade is contested. Escrow stays locked until a moderator rules or the backstop fires.',
);

export const p2pDisputeResolved = defineEvent(
  'p2p',
  'dispute',
  'resolved',
  1,
  z.object({
    disputeId: z.string().uuid(),
    tradeId: z.string().uuid(),
    /**
     * NOT a user id. The dispute backstop rules as a named system principal
     * (`system:p2p-backstop`) precisely so an automatic resolution is never
     * anonymous in the audit trail. Constraining this to a UUID would make the
     * backstop unable to publish — and since the decision commits before the
     * ledger post, a failed publish rolls the whole resolution back and leaves
     * escrow locked. Which is exactly what happened when this was `userIdSchema`.
     */
    moderatorId: z.string().min(1),
    resolution: z.enum(['release', 'refund']),
    /** True when the backstop timer ruled rather than a human. */
    automatic: z.boolean(),
    notes: z.string().optional(),
  }),
  'A moderator ruled. The decision is recorded before the ledger post, so the trail always explains the movement.',
);

export const p2pTradeExpired = defineEvent(
  'p2p',
  'trade',
  'expired',
  1,
  z.object({
    tradeId: z.string().uuid(),
    from: z.string(),
    outcome: z.enum(['released', 'refunded', 'voided', 'disputed']),
  }),
  'A deadline passed and the timeout path acted. Every live state has a clock, and every clock acts.',
);

// ── The registry ─────────────────────────────────────────────────────────────

export const EVENT_CATALOG = {
  xpEarned,
  rankUpdated,
  userCreated,
  kycApproved,
  ledgerTxPosted,
  ledgerReconciliationFailed,
  ledgerFreezeUpdated,
  stakeCreated,
  buybackExecuted,
  bankMarginCalled,
  blueprintCreated,
  blueprintDeleted,
  crewMemberCreated,
  orderAccepted,
  orderFilled,
  orderCancelled,
  orderUpdated,
  fillSettled,
  protocolAccountCreated,
  protocolSessionKeyCreated,
  protocolSessionKeyCancelled,
  agentActionCompleted,
  agentActionRejected,
  agentUsageSettled,
  p2pOfferCreated,
  p2pEscrowLocked,
  p2pEscrowReleased,
  p2pEscrowRefunded,
  p2pTradeDisputed,
  p2pDisputeResolved,
  p2pTradeExpired,
} as const;

export type EventCatalog = typeof EVENT_CATALOG;
export type EventName = keyof EventCatalog;
export type PayloadOf<K extends EventName> = z.infer<EventCatalog[K]['schema']>;

export const ALL_EVENTS: readonly EventDef[] = Object.values(EVENT_CATALOG);

export function eventBySubject(s: string): EventDef | undefined {
  return ALL_EVENTS.find((e) => e.subject === s);
}
