import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryLedger } from '../memory-ledger.js';
import { formatAmount, parseAmount as amt } from '../money.js';
import { subAccountAvailable, userAvailable } from '../accounts.js';
import { InsufficientFundsError, InvalidEntryError } from '../types.js';
import { recipes } from './index.js';
import { subAccountTransfer } from './sub-accounts.js';

/**
 * SPEC-SUBACCOUNTS residual — the transfer recipe is the only legal path
 * value crosses between partitions. These tests are the done bar for the
 * ledger half of that residual:
 *
 *   1. Happy path moves A → B and leaves A and B balanced.
 *   2. Insufficient B (here: source) refuses — sibling A is untouched.
 *   3. Missing ids refuse (no default-to-primary).
 *   4. Same partition refuses.
 *   5. Idempotent on transferId.
 */

const SUB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ASSET = 'USDT';

let ledger: MemoryLedger;

beforeEach(() => {
  ledger = new MemoryLedger();
});

async function fund(subId: string, amount: string): Promise<void> {
  // Seed via a direct deposit-shaped post into the sub-account pot.
  // The transfer recipe is not the entry path for external value.
  await ledger.post({
    idempotencyKey: `seed:${subId}:${amount}:${crypto.randomUUID()}`,
    module: 'test',
    reason: 'test.seed',
    entries: [
      {
        account: { ownerType: 'treasury', ownerId: 'external', assetId: ASSET, kind: 'available' },
        direction: 'credit',
        amount: amt(amount),
      },
      { account: subAccountAvailable(subId, ASSET), direction: 'debit', amount: amt(amount) },
    ],
  });
}

const bal = async (subId: string) => formatAmount((await ledger.balance(subAccountAvailable(subId, ASSET))).amount);

describe('subAccountTransfer — recipe shape', () => {
  it('refuses a missing from or to id (never invent a primary)', () => {
    expect(() =>
      subAccountTransfer({
        transferId: 't1',
        fromSubAccountId: '',
        toSubAccountId: SUB_B,
        assetId: ASSET,
        amount: amt('1'),
      }),
    ).toThrow(InvalidEntryError);

    expect(() =>
      subAccountTransfer({
        transferId: 't1',
        fromSubAccountId: SUB_A,
        toSubAccountId: '',
        assetId: ASSET,
        amount: amt('1'),
      }),
    ).toThrow(InvalidEntryError);
  });

  it('refuses same-partition and non-positive amounts', () => {
    expect(() =>
      subAccountTransfer({
        transferId: 't1',
        fromSubAccountId: SUB_A,
        toSubAccountId: SUB_A,
        assetId: ASSET,
        amount: amt('1'),
      }),
    ).toThrow(InvalidEntryError);

    expect(() =>
      subAccountTransfer({
        transferId: 't1',
        fromSubAccountId: SUB_A,
        toSubAccountId: SUB_B,
        assetId: ASSET,
        amount: amt('0'),
      }),
    ).toThrow(InvalidEntryError);
  });

  it('posts only against subaccount available pots', () => {
    const req = subAccountTransfer({
      transferId: 't1',
      fromSubAccountId: SUB_A,
      toSubAccountId: SUB_B,
      assetId: ASSET,
      amount: amt('10'),
    });
    expect(req.module).toBe('identity');
    expect(req.reason).toBe('identity.sub_account.transfer');
    expect(req.idempotencyKey).toBe('identity.sub_account.transfer:t1');
    expect(req.entries).toHaveLength(2);
    for (const e of req.entries) {
      expect(e.account.ownerType).toBe('subaccount');
      expect(e.account.kind).toBe('available');
    }
  });
});

describe('subAccountTransfer — zero cross-leak at the book', () => {
  it('moves value from A to B', async () => {
    await fund(SUB_A, '100');
    await fund(SUB_B, '5');

    await ledger.post(
      recipes.subAccountTransfer({
        transferId: 'move-1',
        fromSubAccountId: SUB_A,
        toSubAccountId: SUB_B,
        assetId: ASSET,
        amount: amt('40'),
      }),
    );

    expect(await bal(SUB_A)).toBe('60');
    expect(await bal(SUB_B)).toBe('45');
  });

  it('insufficient funds in the SOURCE refuses and leaves the sibling untouched', async () => {
    await fund(SUB_A, '10');
    await fund(SUB_B, '1000');

    // Try to pull 50 out of A (only has 10). B must stay at 1000.
    await expect(
      ledger.post(
        recipes.subAccountTransfer({
          transferId: 'overdraw-a',
          fromSubAccountId: SUB_A,
          toSubAccountId: SUB_B,
          assetId: ASSET,
          amount: amt('50'),
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientFundsError);

    expect(await bal(SUB_A)).toBe('10');
    expect(await bal(SUB_B)).toBe('1000');
  });

  it('insufficient B never drains A — pull from B into A fails, A stays put', async () => {
    await fund(SUB_A, '200');
    await fund(SUB_B, '3');

    await expect(
      ledger.post(
        recipes.subAccountTransfer({
          transferId: 'overdraw-b',
          fromSubAccountId: SUB_B,
          toSubAccountId: SUB_A,
          assetId: ASSET,
          amount: amt('50'),
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientFundsError);

    expect(await bal(SUB_A)).toBe('200');
    expect(await bal(SUB_B)).toBe('3');
  });

  it('is idempotent on transferId — a retry does not double-move', async () => {
    await fund(SUB_A, '100');

    const body = {
      transferId: 'once',
      fromSubAccountId: SUB_A,
      toSubAccountId: SUB_B,
      assetId: ASSET,
      amount: amt('25'),
    };

    const first = await ledger.post(recipes.subAccountTransfer(body));
    const second = await ledger.post(recipes.subAccountTransfer(body));
    expect(second.id).toBe(first.id);
    expect(await bal(SUB_A)).toBe('75');
    expect(await bal(SUB_B)).toBe('25');
  });

  it('does not touch a user available pot when only sub-accounts move', async () => {
    await fund(SUB_A, '50');
    await ledger.post(
      recipes.subAccountTransfer({
        transferId: 'no-user',
        fromSubAccountId: SUB_A,
        toSubAccountId: SUB_B,
        assetId: ASSET,
        amount: amt('20'),
      }),
    );
    expect(formatAmount((await ledger.balance(userAvailable(USER, ASSET))).amount)).toBe('0');
  });
});
