import { z } from 'zod';
import type { Amount, AmountString } from './money.js';

/**
 * The shapes of the balance graph (§4.2).
 *
 * `owner_type` + `owner_id` + `asset_id` + `kind` is unique — one account per
 * purpose, per asset, per owner. Balances only ever change through `post()`.
 */

export const OWNER_TYPES = ['user', 'subaccount', 'module', 'house', 'treasury'] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

export const ACCOUNT_KINDS = ['available', 'hold', 'escrow', 'stake', 'collateral'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ASSET_KINDS = ['crypto', 'fiat', 'native'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export type Direction = 'debit' | 'credit';

export interface AccountRef {
  readonly ownerType: OwnerType;
  readonly ownerId: string;
  readonly assetId: string;
  readonly kind: AccountKind;
  /**
   * Sub-identity within (owner, asset, kind) — P0-3.
   *
   * A `hold` is not fungible with another `hold`. Value reserved for order
   * `abc` and value held for withdrawal `xyz` are both "held for this user in
   * this asset", and before this field they were the same account: a withdrawal
   * could settle out of an open order's reservation and the books would balance
   * perfectly while the order became unfunded.
   *
   * `order:<id>` / `withdraw:<id>` and so on. Empty for accounts where the
   * question does not arise — an `available` balance is fungible with itself by
   * definition, and giving it a purpose would fragment it for no reason.
   *
   * `hold` accounts MUST carry one; `assertPurposedHolds` refuses the post
   * otherwise, so the commingled bucket cannot come back by omission.
   */
  readonly purpose?: string;
}

/** The empty-string normal form. Absent and `''` are the same account. */
export function accountPurpose(ref: AccountRef): string {
  return ref.purpose ?? '';
}

export interface Account extends AccountRef {
  readonly id: string;
  readonly createdAt: Date;
}

export interface EntryInput {
  readonly account: AccountRef;
  readonly direction: Direction;
  readonly amount: Amount;
}

export interface PostedEntry {
  readonly id: string;
  readonly txId: string;
  readonly accountId: string;
  readonly assetId: string;
  readonly direction: Direction;
  readonly amount: Amount;
  readonly balanceAfter: Amount;
}

export interface PostRequest {
  /**
   * The dedupe key. Two posts with the same key are the same post; the second
   * returns the first one's result rather than doubling the money.
   */
  readonly idempotencyKey: string;
  /** Which module initiated this movement — for reconciliation and freezes. */
  readonly module: string;
  /** Machine-readable reason, e.g. 'trade.fill', 'p2p.escrow.lock'. */
  readonly reason: string;
  readonly entries: readonly EntryInput[];
  readonly meta?: Record<string, unknown>;
  /** Trace correlation (§9) — the request that caused the movement. */
  readonly correlationId?: string;
}

export interface LedgerTx {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly module: string;
  readonly reason: string;
  readonly meta: Record<string, unknown>;
  readonly postedAt: Date;
  /** H(previousHash ‖ canonical(tx)) — tamper-evident book (§4.2). */
  readonly hash: string;
  readonly previousHash: string | null;
  readonly entries: readonly PostedEntry[];
}

export interface Balance {
  readonly account: AccountRef;
  readonly accountId: string;
  readonly amount: Amount;
}

// ── Errors ───────────────────────────────────────────────────────────────────

export class LedgerError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

/** Σ debits ≠ Σ credits for some asset. The cardinal sin. */
export class UnbalancedTransactionError extends LedgerError {
  constructor(readonly perAsset: Record<string, AmountString>) {
    super(
      `Transaction does not sum to zero per asset: ${Object.entries(perAsset)
        .map(([asset, delta]) => `${asset} off by ${delta}`)
        .join(', ')}`,
      'ledger.unbalanced',
    );
    this.name = 'UnbalancedTransactionError';
  }
}

/** An `available` account would have gone below zero. */
export class InsufficientFundsError extends LedgerError {
  constructor(
    readonly accountId: string,
    readonly assetId: string,
    readonly requested: AmountString,
    readonly availableBalance: AmountString,
  ) {
    super(`Insufficient ${assetId}: requested ${requested}, available ${availableBalance}`, 'ledger.insufficient_funds');
    this.name = 'InsufficientFundsError';
  }
}

export class InvalidEntryError extends LedgerError {
  constructor(message: string) {
    super(message, 'ledger.invalid_entry');
    this.name = 'InvalidEntryError';
  }
}

// ── Wire schemas (used by svc-ledger's tRPC surface) ─────────────────────────

export const accountRefSchema = z.object({
  ownerType: z.enum(OWNER_TYPES),
  ownerId: z.string().min(1),
  assetId: z.string().min(1).max(16),
  kind: z.enum(ACCOUNT_KINDS),
  /** Bounded because it is part of an index key, not free-form metadata. */
  purpose: z.string().max(128).optional(),
});

export const entryInputSchema = z.object({
  account: accountRefSchema,
  direction: z.enum(['debit', 'credit']),
  amount: z.string().regex(/^\d+(\.\d{1,18})?$/, 'entry amounts are unsigned decimal strings'),
});

export const postRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(200),
  module: z.string().min(1),
  reason: z.string().min(1),
  entries: z.array(entryInputSchema).min(2),
  meta: z.record(z.unknown()).optional(),
  correlationId: z.string().optional(),
});
