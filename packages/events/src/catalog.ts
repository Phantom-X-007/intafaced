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
  protocolAccountCreated,
  protocolSessionKeyCreated,
  protocolSessionKeyCancelled,
} as const;

export type EventCatalog = typeof EVENT_CATALOG;
export type EventName = keyof EventCatalog;
export type PayloadOf<K extends EventName> = z.infer<EventCatalog[K]['schema']>;

export const ALL_EVENTS: readonly EventDef[] = Object.values(EVENT_CATALOG);

export function eventBySubject(s: string): EventDef | undefined {
  return ALL_EVENTS.find((e) => e.subject === s);
}
