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

// ── The registry ─────────────────────────────────────────────────────────────

export const EVENT_CATALOG = {
  xpEarned,
  rankUpdated,
  userCreated,
  kycApproved,
  ledgerTxPosted,
  ledgerReconciliationFailed,
  stakeCreated,
  buybackExecuted,
  orderAccepted,
  orderFilled,
  orderCancelled,
  agentActionCompleted,
  agentActionRejected,
  agentUsageSettled,
} as const;

export type EventCatalog = typeof EVENT_CATALOG;
export type EventName = keyof EventCatalog;
export type PayloadOf<K extends EventName> = z.infer<EventCatalog[K]['schema']>;

export const ALL_EVENTS: readonly EventDef[] = Object.values(EVENT_CATALOG);

export function eventBySubject(s: string): EventDef | undefined {
  return ALL_EVENTS.find((e) => e.subject === s);
}
