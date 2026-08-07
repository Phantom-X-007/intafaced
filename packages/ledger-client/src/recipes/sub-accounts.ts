import type { Amount } from '../money.js';
import type { EntryInput, PostRequest } from '../types.js';
import { InvalidEntryError } from '../types.js';
import { subAccountAvailable } from '../accounts.js';

/**
 * SUB-ACCOUNT TRANSFER — the only legal path value crosses between identity
 * sub-account partitions (SPEC-SUBACCOUNTS §1 "the one exception").
 *
 * Pure recipe: no I/O, no ownership check. Ownership-at-the-door is identity's
 * job (`assertSubAccountTransferDoor`); this only asserts the journal shape:
 *
 *   - both legs are `subaccount` available pots (never user/house/module)
 *   - same asset (no invented FX)
 *   - different partitions
 *   - positive amount
 *   - business-key idempotency (`identity.sub_account.transfer:<transferId>`)
 *
 * `bankTransfer` is related but different: it takes arbitrary `AccountRef`s so
 * bank *spaces* can move primary↔named. This recipe refuses anything that is
 * not a sub-account available pot, so a caller cannot quietly credit a user
 * pot or a house fee account under a "sub-account transfer" reason.
 */

const debit = (account: ReturnType<typeof subAccountAvailable>, amount: Amount): EntryInput => ({
  account,
  direction: 'debit',
  amount,
});
const credit = (account: ReturnType<typeof subAccountAvailable>, amount: Amount): EntryInput => ({
  account,
  direction: 'credit',
  amount,
});

function requirePositive(name: string, value: Amount): void {
  if (value <= 0n) throw new InvalidEntryError(`${name} must be positive`);
}

export interface SubAccountTransferInput {
  /** Caller-supplied business id. Retries must reuse it. */
  transferId: string;
  fromSubAccountId: string;
  toSubAccountId: string;
  assetId: string;
  amount: Amount;
}

/**
 * Move value from one identity sub-account available pot to another.
 *
 * Debit convention matches `bankTransfer`: credit the source (value leaves),
 * debit the destination (value arrives). The ledger refuses a credit that
 * would take the source below zero — that is the "insufficient B never drains
 * A" half of zero cross-leak: the shortfall is a refusal, never a reach into
 * a sibling.
 */
export function subAccountTransfer(input: SubAccountTransferInput): PostRequest {
  requirePositive('sub-account transfer amount', input.amount);

  if (!input.transferId) {
    throw new InvalidEntryError('transferId is required');
  }
  if (!input.fromSubAccountId || !input.toSubAccountId) {
    throw new InvalidEntryError('Both fromSubAccountId and toSubAccountId are required — never default to primary');
  }
  if (input.fromSubAccountId === input.toSubAccountId) {
    throw new InvalidEntryError('A sub-account transfer must have two different partitions');
  }
  if (!input.assetId) {
    throw new InvalidEntryError('assetId is required');
  }

  const from = subAccountAvailable(input.fromSubAccountId, input.assetId);
  const to = subAccountAvailable(input.toSubAccountId, input.assetId);

  return {
    idempotencyKey: `identity.sub_account.transfer:${input.transferId}`,
    module: 'identity',
    reason: 'identity.sub_account.transfer',
    meta: {
      transferId: input.transferId,
      fromSubAccountId: input.fromSubAccountId,
      toSubAccountId: input.toSubAccountId,
    },
    entries: [credit(from, input.amount), debit(to, input.amount)],
  };
}
