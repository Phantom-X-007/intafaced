import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryLedger } from './memory-ledger.js';
import { runLedgerConformance } from './testing/conformance.js';

/**
 * The reference implementation runs the shared conformance suite — the same one
 * svc-ledger's Postgres engine runs. Everything below this line is additional
 * coverage specific to the in-memory implementation.
 */
let conformanceLedger = new MemoryLedger();
runLedgerConformance('MemoryLedger', async () => ({
  get ledger() {
    return conformanceLedger;
  },
  reset: async () => {
    conformanceLedger = new MemoryLedger();
  },
  journal: async () => conformanceLedger.journal(),
  reconcile: async () => conformanceLedger.reconcile(),
  verifyChain: async () => conformanceLedger.verifyChain(),
  totalsByAsset: async () => conformanceLedger.totalsByAsset(),
}));
import { formatAmount, parseAmount as amt, sum } from './money.js';
import { assertBalanced, assertPairedLocks } from './client.js';
import { houseFees, userAvailable, userEscrow, userHold, userStake, railBoundary } from './accounts.js';
import { InsufficientFundsError, InvalidEntryError, UnbalancedTransactionError } from './types.js';
import { recipes } from './recipes/index.js';

/**
 * THE LEDGER INVARIANT SUITE (§4.4 exit criteria).
 *
 * Every implementation of LedgerClient must pass this file unmodified. When
 * svc-ledger lands on Postgres, this suite is pointed at it too.
 */

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

let ledger: MemoryLedger;

beforeEach(() => {
  ledger = new MemoryLedger();
});

async function fund(userId: string, assetId: string, amount: string): Promise<void> {
  await ledger.post(recipes.deposit({ userId, assetId, amount: amt(amount), rail: 'test', railRef: `${userId}:${assetId}:${amount}` }));
}

async function balanceOf(userId: string, assetId: string, kind: 'available' | 'hold' | 'escrow' | 'stake' = 'available') {
  const ref =
    kind === 'available'
      ? userAvailable(userId, assetId)
      : kind === 'hold'
        ? userHold(userId, assetId)
        : kind === 'escrow'
          ? userEscrow(userId, assetId)
          : userStake(userId, assetId);
  return formatAmount((await ledger.balance(ref)).amount);
}

describe('INVARIANT 1 — every transaction sums to zero per asset', () => {
  it('accepts a balanced transaction', () => {
    expect(() =>
      assertBalanced([
        { account: userAvailable(USER_A, 'USDT'), direction: 'debit', amount: amt('100') },
        { account: railBoundary('test', 'USDT'), direction: 'credit', amount: amt('100') },
      ]),
    ).not.toThrow();
  });

  it('rejects an unbalanced transaction and names the asset', () => {
    try {
      assertBalanced([
        { account: userAvailable(USER_A, 'USDT'), direction: 'debit', amount: amt('100') },
        { account: railBoundary('test', 'USDT'), direction: 'credit', amount: amt('99') },
      ]);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(UnbalancedTransactionError);
      expect((e as UnbalancedTransactionError).perAsset.USDT).toBe('1');
    }
  });

  it('checks each asset independently — a multi-asset tx cannot net across assets', () => {
    expect(() =>
      assertBalanced([
        { account: userAvailable(USER_A, 'USDT'), direction: 'debit', amount: amt('100') },
        { account: userAvailable(USER_B, 'BTC'), direction: 'credit', amount: amt('100') },
      ]),
    ).toThrow(UnbalancedTransactionError);
  });

  it('rejects a single-entry transaction', () => {
    expect(() => assertBalanced([{ account: userAvailable(USER_A, 'USDT'), direction: 'debit', amount: amt('100') }])).toThrow(
      InvalidEntryError,
    );
  });

  it('rejects zero and negative entry amounts', () => {
    expect(() =>
      assertBalanced([
        { account: userAvailable(USER_A, 'USDT'), direction: 'debit', amount: 0n },
        { account: railBoundary('test', 'USDT'), direction: 'credit', amount: 0n },
      ]),
    ).toThrow(InvalidEntryError);

    expect(() =>
      assertBalanced([
        { account: userAvailable(USER_A, 'USDT'), direction: 'debit', amount: amt('-5') },
        { account: railBoundary('test', 'USDT'), direction: 'credit', amount: amt('-5') },
      ]),
    ).toThrow(InvalidEntryError);
  });
});

describe('INVARIANT 2 — available never goes negative', () => {
  it('refuses to overdraw a user', async () => {
    await fund(USER_A, 'USDT', '100');
    await expect(
      ledger.post(
        recipes.withdrawHold({ userId: USER_A, assetId: 'USDT', amount: amt('100.000000000000000001'), rail: 'test', withdrawalId: 'w1' }),
      ),
    ).rejects.toThrow(InsufficientFundsError);
    expect(await balanceOf(USER_A, 'USDT')).toBe('100');
  });

  it('allows a withdrawal to exactly zero', async () => {
    await fund(USER_A, 'USDT', '100');
    await ledger.post(recipes.withdrawHold({ userId: USER_A, assetId: 'USDT', amount: amt('100'), rail: 'test', withdrawalId: 'w1' }));
    expect(await balanceOf(USER_A, 'USDT')).toBe('0');
    expect(await balanceOf(USER_A, 'USDT', 'hold')).toBe('100');
  });

  it('leaves the book untouched when a post is rejected', async () => {
    await fund(USER_A, 'USDT', '10');
    const before = ledger.journal().length;
    await expect(
      ledger.post(recipes.withdrawHold({ userId: USER_A, assetId: 'USDT', amount: amt('999'), rail: 'test', withdrawalId: 'w2' })),
    ).rejects.toThrow(InsufficientFundsError);
    expect(ledger.journal().length).toBe(before);
    expect(await balanceOf(USER_A, 'USDT')).toBe('10');
  });

  it('lets only the treasury boundary run negative — that is the custody obligation', async () => {
    await fund(USER_A, 'USDT', '100');
    const boundary = await ledger.balance(railBoundary('test', 'USDT'));
    expect(formatAmount(boundary.amount)).toBe('-100');
  });
});

describe('INVARIANT 3 — locks are funded from the owner’s own available balance', () => {
  it('accepts a paired lock', () => {
    expect(() =>
      assertPairedLocks([
        { account: userAvailable(USER_A, 'BTC'), direction: 'credit', amount: amt('1') },
        { account: userHold(USER_A, 'BTC'), direction: 'debit', amount: amt('1') },
      ]),
    ).not.toThrow();
  });

  it('rejects collateral conjured without an available counter-entry', () => {
    expect(() =>
      assertPairedLocks([
        { account: houseFees('bank', 'BTC'), direction: 'credit', amount: amt('1') },
        { account: userHold(USER_A, 'BTC'), direction: 'debit', amount: amt('1') },
      ]),
    ).toThrow(InvalidEntryError);
  });

  it('rejects a lock larger than what the owner gave up', () => {
    expect(() =>
      assertPairedLocks([
        { account: userAvailable(USER_A, 'BTC'), direction: 'credit', amount: amt('1') },
        { account: userHold(USER_A, 'BTC'), direction: 'debit', amount: amt('2') },
      ]),
    ).toThrow(InvalidEntryError);
  });

  it('allows a lock plus a fee taken from the same available balance', () => {
    expect(() =>
      assertPairedLocks([
        { account: userAvailable(USER_A, 'BTC'), direction: 'credit', amount: amt('1.01') },
        { account: userHold(USER_A, 'BTC'), direction: 'debit', amount: amt('1') },
        { account: houseFees('trade', 'BTC'), direction: 'debit', amount: amt('0.01') },
      ]),
    ).not.toThrow();
  });

  it('does not constrain releasing a lock', () => {
    expect(() =>
      assertPairedLocks([
        { account: userHold(USER_A, 'BTC'), direction: 'credit', amount: amt('1') },
        { account: userAvailable(USER_B, 'BTC'), direction: 'debit', amount: amt('1') },
      ]),
    ).not.toThrow();
  });
});

describe('INVARIANT 4 — idempotency', () => {
  it('returns the original transaction and does not double the money', async () => {
    const request = recipes.deposit({ userId: USER_A, assetId: 'USDT', amount: amt('50'), rail: 'crypto-native', railRef: '0xabc' });

    const first = await ledger.post(request);
    const second = await ledger.post(request);

    expect(second.id).toBe(first.id);
    expect(await balanceOf(USER_A, 'USDT')).toBe('50');
    expect(ledger.journal()).toHaveLength(1);
  });

  it('survives a burst of concurrent retries of the same post', async () => {
    const request = recipes.deposit({ userId: USER_A, assetId: 'USDT', amount: amt('50'), rail: 'crypto-native', railRef: '0xdef' });
    const results = await Promise.all(Array.from({ length: 50 }, () => ledger.post(request)));

    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await balanceOf(USER_A, 'USDT')).toBe('50');
  });

  it('requires a meaningful idempotency key', async () => {
    await expect(
      ledger.post({
        idempotencyKey: 'short',
        module: 'test',
        reason: 'test',
        entries: [
          { account: userAvailable(USER_A, 'USDT'), direction: 'debit', amount: amt('1') },
          { account: railBoundary('test', 'USDT'), direction: 'credit', amount: amt('1') },
        ],
      }),
    ).rejects.toThrow(InvalidEntryError);
  });
});

describe('INVARIANT 5 — hash chain', () => {
  it('chains every transaction to its predecessor', async () => {
    await fund(USER_A, 'USDT', '100');
    await fund(USER_B, 'USDT', '200');
    await ledger.post(recipes.withdrawHold({ userId: USER_A, assetId: 'USDT', amount: amt('10'), rail: 'test', withdrawalId: 'w1' }));

    const journal = ledger.journal();
    expect(journal[0]?.previousHash).toBeNull();
    expect(journal[1]?.previousHash).toBe(journal[0]?.hash);
    expect(journal[2]?.previousHash).toBe(journal[1]?.hash);
    expect(ledger.verifyChain()).toEqual({ ok: true });
  });

  it('detects tampering', async () => {
    await fund(USER_A, 'USDT', '100');
    await fund(USER_B, 'USDT', '200');

    const journal = ledger.journal();
    const target = journal[1]!;
    // Rewrite history: inflate an entry after the fact.
    (target.entries[1] as { amount: bigint }).amount = amt('999999');

    const result = ledger.verifyChain();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.brokenAt).toBe(target.id);
  });
});

describe('reconciliation — snapshots must equal replay', () => {
  it('agrees after a long mixed run', async () => {
    await fund(USER_A, 'USDT', '10000');
    await fund(USER_B, 'BTC', '5');

    for (let i = 0; i < 200; i++) {
      await ledger.post(recipes.orderHold({ orderId: `o${i}`, userId: USER_A, assetId: 'USDT', amount: amt('10') }));
      await ledger.post(recipes.orderHoldRelease({ orderId: `o${i}`, userId: USER_A, assetId: 'USDT', amount: amt('10') }));
    }

    expect(ledger.reconcile()).toEqual({ ok: true });
    expect(await balanceOf(USER_A, 'USDT')).toBe('10000');
  });

  it('closes the books — every asset nets to zero across all accounts', async () => {
    await fund(USER_A, 'USDT', '1000');
    await fund(USER_B, 'BTC', '2');
    await ledger.post(recipes.orderHold({ orderId: 'h1', userId: USER_A, assetId: 'USDT', amount: amt('250') }));
    await ledger.post(recipes.escrowLock({ tradeId: 'e1', sellerId: USER_B, buyerId: USER_A, assetId: 'BTC', amount: amt('1') }));

    expect(ledger.totalsByAsset()).toEqual({ USDT: '0', BTC: '0' });
  });
});

describe('recipes — the money paths', () => {
  it('trade fill: six entries, fees to house, books closed', async () => {
    await fund(USER_A, 'USDT', '1000'); // taker, buying
    await fund(USER_B, 'BTC', '2'); // maker, selling

    await ledger.post(recipes.orderHold({ orderId: 'taker-1', userId: USER_A, assetId: 'USDT', amount: amt('900') }));
    await ledger.post(recipes.orderHold({ orderId: 'maker-1', userId: USER_B, assetId: 'BTC', amount: amt('1') }));

    const tx = await ledger.post(
      recipes.tradeFill({
        fillId: 'f1',
        makerId: USER_B,
        takerId: USER_A,
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        qty: amt('1'),
        quoteAmount: amt('900'),
        takerSide: 'buy',
        makerFeeBps: 10, // maker receives USDT, pays 0.10% => 0.9
        takerFeeBps: 20, // taker receives BTC,  pays 0.20% => 0.002
      }),
    );

    expect(tx.entries).toHaveLength(6);

    expect(await balanceOf(USER_B, 'USDT')).toBe('899.1');
    expect(await balanceOf(USER_A, 'BTC')).toBe('0.998');
    expect(formatAmount((await ledger.balance(houseFees('trade', 'USDT'))).amount)).toBe('0.9');
    expect(formatAmount((await ledger.balance(houseFees('trade', 'BTC'))).amount)).toBe('0.002');

    // Holds fully consumed.
    expect(await balanceOf(USER_A, 'USDT', 'hold')).toBe('0');
    expect(await balanceOf(USER_B, 'BTC', 'hold')).toBe('0');

    expect(ledger.totalsByAsset()).toEqual({ USDT: '0', BTC: '0' });
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('trade fill: a taker selling is the exact mirror', async () => {
    await fund(USER_A, 'BTC', '1'); // taker, selling
    await fund(USER_B, 'USDT', '900'); // maker, buying

    await ledger.post(recipes.orderHold({ orderId: 't2', userId: USER_A, assetId: 'BTC', amount: amt('1') }));
    await ledger.post(recipes.orderHold({ orderId: 'm2', userId: USER_B, assetId: 'USDT', amount: amt('900') }));

    await ledger.post(
      recipes.tradeFill({
        fillId: 'f2',
        makerId: USER_B,
        takerId: USER_A,
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        qty: amt('1'),
        quoteAmount: amt('900'),
        takerSide: 'sell',
        makerFeeBps: 10, // maker receives BTC
        takerFeeBps: 20, // taker receives USDT
      }),
    );

    expect(await balanceOf(USER_A, 'USDT')).toBe('898.2'); // 900 − 0.2%
    expect(await balanceOf(USER_B, 'BTC')).toBe('0.999'); // 1 − 0.1%
    expect(ledger.totalsByAsset()).toEqual({ BTC: '0', USDT: '0' });
  });

  it('p2p escrow: lock → release strands nothing', async () => {
    await fund(USER_A, 'USDT', '500');

    await ledger.post(recipes.escrowLock({ tradeId: 't1', sellerId: USER_A, buyerId: USER_B, assetId: 'USDT', amount: amt('500') }));
    expect(await balanceOf(USER_A, 'USDT')).toBe('0');
    expect(await balanceOf(USER_A, 'USDT', 'escrow')).toBe('500');

    await ledger.post(
      recipes.escrowRelease({ tradeId: 't1', sellerId: USER_A, buyerId: USER_B, assetId: 'USDT', amount: amt('500'), feeBps: 20 }),
    );

    expect(await balanceOf(USER_A, 'USDT', 'escrow')).toBe('0');
    expect(await balanceOf(USER_B, 'USDT')).toBe('499');
    expect(formatAmount((await ledger.balance(houseFees('p2p', 'USDT'))).amount)).toBe('1');
    expect(ledger.totalsByAsset().USDT).toBe('0');
  });

  it('p2p escrow: refund returns the seller to whole', async () => {
    await fund(USER_A, 'USDT', '500');
    await ledger.post(recipes.escrowLock({ tradeId: 't2', sellerId: USER_A, buyerId: USER_B, assetId: 'USDT', amount: amt('500') }));
    await ledger.post(recipes.escrowRefund({ tradeId: 't2', sellerId: USER_A, buyerId: USER_B, assetId: 'USDT', amount: amt('500') }));

    expect(await balanceOf(USER_A, 'USDT')).toBe('500');
    expect(await balanceOf(USER_A, 'USDT', 'escrow')).toBe('0');
  });

  it('fee charge: the IFC discount branch charges less, and the discount is not invented value', async () => {
    await fund(USER_A, 'IFC', '1000');

    await ledger.post(
      recipes.feeCharge({
        chargeId: 'c1',
        userId: USER_A,
        module: 'trade',
        mode: 'token',
        tokenAssetId: 'IFC',
        grossTokenAmount: amt('100'),
        discountBps: 2500, // 25% off
      }),
    );

    expect(await balanceOf(USER_A, 'IFC')).toBe('925');
    expect(formatAmount((await ledger.balance(houseFees('trade', 'IFC'))).amount)).toBe('75');
    expect(ledger.totalsByAsset().IFC).toBe('0');
  });

  it('staking: stake then unstake round-trips exactly', async () => {
    await fund(USER_A, 'IFC', '10000');

    await ledger.post(recipes.stake({ stakeId: 's1', userId: USER_A, assetId: 'IFC', amount: amt('4000'), tier: 'm12' }));
    expect(await balanceOf(USER_A, 'IFC')).toBe('6000');
    expect(await balanceOf(USER_A, 'IFC', 'stake')).toBe('4000');

    await ledger.post(recipes.unstake({ stakeId: 's1', userId: USER_A, assetId: 'IFC', amount: amt('4000'), tier: 'm12' }));
    expect(await balanceOf(USER_A, 'IFC')).toBe('10000');
    expect(await balanceOf(USER_A, 'IFC', 'stake')).toBe('0');
  });

  it('withdrawal: hold → settle removes value only once', async () => {
    await fund(USER_A, 'BTC', '1');
    const w = { userId: USER_A, assetId: 'BTC', amount: amt('0.5'), rail: 'crypto-native', withdrawalId: 'wd-1' };

    await ledger.post(recipes.withdrawHold(w));
    await ledger.post(recipes.withdrawSettle(w));
    await ledger.post(recipes.withdrawSettle(w)); // retry

    expect(await balanceOf(USER_A, 'BTC')).toBe('0.5');
    expect(await balanceOf(USER_A, 'BTC', 'hold')).toBe('0');
    expect(ledger.totalsByAsset().BTC).toBe('0');
  });

  it('withdrawal: a failed rail reverses the hold', async () => {
    await fund(USER_A, 'BTC', '1');
    const w = { userId: USER_A, assetId: 'BTC', amount: amt('0.5'), rail: 'crypto-native', withdrawalId: 'wd-2' };

    await ledger.post(recipes.withdrawHold(w));
    await ledger.post(recipes.withdrawReverse(w));

    expect(await balanceOf(USER_A, 'BTC')).toBe('1');
    expect(await balanceOf(USER_A, 'BTC', 'hold')).toBe('0');
  });

  it('rewards are paid from the rewards engine, never minted at the edge', async () => {
    // Fund the rewards engine from the mint boundary first — the only minter.
    await ledger.post(
      recipes.mintEmission({
        epoch: 1,
        assetId: 'IFC',
        amount: amt('1000'),
        destination: { ownerType: 'house', ownerId: 'rewards-engine', assetId: 'IFC', kind: 'available' },
      }),
    );

    await ledger.post(recipes.rewardPay({ rewardId: 'r1', userId: USER_A, assetId: 'IFC', amount: amt('250'), reason: 'staking.yield' }));

    expect(await balanceOf(USER_A, 'IFC')).toBe('250');
    expect(ledger.totalsByAsset().IFC).toBe('0');
  });
});

/**
 * The reference ledger is single-threaded, so these establish that the *rules*
 * hold under load and that rejected posts leave no residue. The true
 * concurrency gate — 1k parallel posts under SERIALIZABLE with zero drift
 * (§4.4) — runs against svc-ledger's Postgres implementation.
 */
describe('torture — volume and drift', () => {
  it('holds zero drift across 1,000 interleaved posts', async () => {
    await fund(USER_A, 'USDT', '100000');
    await fund(USER_B, 'USDT', '100000');

    const posts: Array<Promise<unknown>> = [];
    for (let i = 0; i < 500; i++) {
      posts.push(ledger.post(recipes.orderHold({ orderId: `a${i}`, userId: USER_A, assetId: 'USDT', amount: amt('1') })));
      posts.push(ledger.post(recipes.orderHold({ orderId: `b${i}`, userId: USER_B, assetId: 'USDT', amount: amt('1') })));
    }
    await Promise.all(posts);

    expect(await balanceOf(USER_A, 'USDT')).toBe('99500');
    expect(await balanceOf(USER_A, 'USDT', 'hold')).toBe('500');
    expect(ledger.reconcile()).toEqual({ ok: true });
    expect(ledger.verifyChain()).toEqual({ ok: true });
    expect(ledger.totalsByAsset().USDT).toBe('0');
  });

  it('never lets parallel spending exceed the balance', async () => {
    await fund(USER_A, 'USDT', '100');

    const attempts = Array.from({ length: 20 }, (_, i) =>
      ledger
        .post(recipes.orderHold({ orderId: `race-${i}`, userId: USER_A, assetId: 'USDT', amount: amt('10') }))
        .then(() => 'ok' as const)
        .catch(() => 'rejected' as const),
    );
    const results = await Promise.all(attempts);

    expect(results.filter((r) => r === 'ok')).toHaveLength(10);
    expect(await balanceOf(USER_A, 'USDT')).toBe('0');
    expect(await balanceOf(USER_A, 'USDT', 'hold')).toBe('100');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('sums every entry in the journal to zero per asset', async () => {
    await fund(USER_A, 'USDT', '1000');
    await ledger.post(recipes.orderHold({ orderId: 'x', userId: USER_A, assetId: 'USDT', amount: amt('100') }));

    for (const tx of ledger.journal()) {
      const perAsset = new Map<string, bigint>();
      for (const e of tx.entries) {
        const delta = e.direction === 'debit' ? e.amount : -e.amount;
        perAsset.set(e.assetId, (perAsset.get(e.assetId) ?? 0n) + delta);
      }
      for (const [asset, delta] of perAsset) {
        expect(delta, `${tx.reason} / ${asset}`).toBe(0n);
      }
    }
  });

  it('records a running balance on every entry that matches the final state', async () => {
    await fund(USER_A, 'USDT', '100');
    await ledger.post(recipes.orderHold({ orderId: 'y', userId: USER_A, assetId: 'USDT', amount: amt('30') }));

    const last = ledger.journal().at(-1)!;
    const availableEntry = last.entries.find((e) => e.direction === 'credit')!;
    expect(formatAmount(availableEntry.balanceAfter)).toBe('70');
  });
});

describe('helpers', () => {
  it('sums an empty list to zero', () => {
    expect(sum([])).toBe(0n);
  });
});
