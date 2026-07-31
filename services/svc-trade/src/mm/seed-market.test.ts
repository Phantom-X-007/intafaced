import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  marketMaker,
  marketMakerOrderHoldAccount,
  MemoryLedger,
  parseAmount as amt,
  recipes,
} from '@intafaced/ledger-client';
import type { EngineSubmitRequest, EngineSubmitResult, MatchingClient } from '../spot/matching-client.js';
import { MM_MATCHING_ACCOUNT_ID, seedMarket, summarizeSeedMarket } from './seed-market.js';

async function fundMm(ledger: MemoryLedger, asset: string, amount: string, seedId: string) {
  await ledger.post(recipes.marketMakerSeedFund({ assetId: asset, amount: amt(amount), seedId }));
}

/** Minimal matching double — avoids pulling contracts via spot/testing. */
class SeedStubMatching implements Pick<MatchingClient, 'submit'> {
  readonly submitted: Array<{ marketId: string; request: EngineSubmitRequest }> = [];
  private seq = 0;
  private readonly scripts: Array<(req: EngineSubmitRequest) => EngineSubmitResult> = [];

  script(fn: (req: EngineSubmitRequest) => EngineSubmitResult): this {
    this.scripts.push(fn);
    return this;
  }

  async submit(marketId: string, request: EngineSubmitRequest): Promise<EngineSubmitResult> {
    this.submitted.push({ marketId, request });
    const scripted = this.scripts.shift();
    if (scripted) return scripted(request);
    const sequence = ++this.seq;
    return {
      accepted: true,
      sequence,
      fills: [],
      resting: {
        kind: 'book',
        orderId: request.orderId,
        accountId: request.accountId,
        side: request.side,
        price: request.price ?? '0',
        remaining: request.qty,
        sequence,
      },
      rejected: null,
      cancellations: [],
      triggered: [],
    };
  }
}

describe('seedMarket', () => {
  it('refuses missing mid — no hold, no submit', async () => {
    const ledger = new MemoryLedger();
    const matching = new SeedStubMatching();
    const result = await seedMarket(
      {
        marketId: 'btc-usdt',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        midPrice: null,
        halfSpreadBps: 10,
        stepBps: 10,
        levels: 1,
        qtyPerLevel: '1',
        runId: 'run-1',
      },
      { ledger, matching },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('missing_mid');
    expect(matching.submitted).toHaveLength(0);
  });

  it('holds inventory and rests post-only limits under house:market-maker', async () => {
    const ledger = new MemoryLedger();
    await fundMm(ledger, 'USDT', '10000', 'fund-quote');
    await fundMm(ledger, 'BTC', '100', 'fund-base');
    const matching = new SeedStubMatching();

    const result = await seedMarket(
      {
        marketId: 'btc-usdt',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        midPrice: '100',
        halfSpreadBps: 100, // 1% → bid 99 / ask 101
        stepBps: 0,
        levels: 1,
        qtyPerLevel: '1',
        runId: 'run-a',
      },
      { ledger, matching },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements).toHaveLength(2);
    expect(result.placements.every((p) => p.status === 'resting')).toBe(true);
    expect(matching.submitted).toHaveLength(2);

    for (const sub of matching.submitted) {
      expect(sub.marketId).toBe('btc-usdt');
      expect(sub.request.accountId).toBe(MM_MATCHING_ACCOUNT_ID);
      expect(sub.request.type).toBe('limit');
      expect(sub.request.tif).toBe('PO');
    }

    const buy = matching.submitted.find((s) => s.request.side === 'buy')!;
    const sell = matching.submitted.find((s) => s.request.side === 'sell')!;
    expect(buy.request.price).toBe('99');
    expect(sell.request.price).toBe('101');

    // buy holds quote (99 * 1), sell holds base (1)
    expect(formatAmount((await ledger.balance(marketMakerOrderHoldAccount('USDT', buy.request.orderId))).amount)).toBe('99');
    expect(formatAmount((await ledger.balance(marketMakerOrderHoldAccount('BTC', sell.request.orderId))).amount)).toBe('1');
    // pot drawn down
    expect(formatAmount((await ledger.balance(marketMaker('USDT'))).amount)).toBe('9901');
    expect(formatAmount((await ledger.balance(marketMaker('BTC'))).amount)).toBe('99');
    expect(summarizeSeedMarket(result)).toContain('resting=2/2');
  });

  it('releases hold when engine rejects (post-only would cross)', async () => {
    const ledger = new MemoryLedger();
    await fundMm(ledger, 'USDT', '1000', 'fund-r');
    await fundMm(ledger, 'BTC', '10', 'fund-r-b');
    const matching = new SeedStubMatching();
    const reject = (): EngineSubmitResult => ({
      accepted: false,
      sequence: null,
      fills: [],
      resting: null,
      rejected: { code: 'post_only_would_cross', message: 'would cross' },
      cancellations: [],
      triggered: [],
    });
    matching.script(reject).script(reject);

    const result = await seedMarket(
      {
        marketId: 'btc-usdt',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        midPrice: '100',
        halfSpreadBps: 100,
        stepBps: 0,
        levels: 1,
        qtyPerLevel: '1',
        runId: 'run-reject',
      },
      { ledger, matching },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_resting_orders');
    expect(result.placements.every((p) => p.status === 'released_after_reject')).toBe(true);
    // inventory fully returned
    expect(formatAmount((await ledger.balance(marketMaker('USDT'))).amount)).toBe('1000');
    expect(formatAmount((await ledger.balance(marketMaker('BTC'))).amount)).toBe('10');
  });

  it('idempotent re-seed reuses order hold key (no double draw)', async () => {
    const ledger = new MemoryLedger();
    await fundMm(ledger, 'USDT', '1000', 'fund-i');
    await fundMm(ledger, 'BTC', '10', 'fund-i-b');
    const matching = new SeedStubMatching();

    const spec = {
      marketId: 'btc-usdt',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      midPrice: '100',
      halfSpreadBps: 100,
      stepBps: 0,
      levels: 1,
      qtyPerLevel: '1',
      runId: 'run-idem',
    } as const;

    const first = await seedMarket(spec, { ledger, matching });
    expect(first.ok).toBe(true);
    const usdtAfterFirst = formatAmount((await ledger.balance(marketMaker('USDT'))).amount);
    const btcAfterFirst = formatAmount((await ledger.balance(marketMaker('BTC'))).amount);

    // Second run: hold posts are idempotent; matching gets another submit (caller
    // must not double-seed live books without cancel — residual ops concern).
    const second = await seedMarket(spec, { ledger, matching });
    expect(second.ok).toBe(true);
    expect(formatAmount((await ledger.balance(marketMaker('USDT'))).amount)).toBe(usdtAfterFirst);
    expect(formatAmount((await ledger.balance(marketMaker('BTC'))).amount)).toBe(btcAfterFirst);
  });

  it('hold_failed when pot empty — no matching submit for that intent', async () => {
    const ledger = new MemoryLedger();
    // only base funded; buy side needs quote
    await fundMm(ledger, 'BTC', '10', 'fund-only-base');
    const matching = new SeedStubMatching();

    const result = await seedMarket(
      {
        marketId: 'btc-usdt',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        midPrice: '100',
        halfSpreadBps: 100,
        stepBps: 0,
        levels: 1,
        qtyPerLevel: '1',
        runId: 'run-empty',
      },
      { ledger, matching },
    );

    // plan order is buy then sell per level — buy hold fails first
    const buyPlacement = result.placements.find((p) => p.intent.side === 'buy');
    const sellPlacement = result.placements.find((p) => p.intent.side === 'sell');
    expect(buyPlacement?.status).toBe('hold_failed');
    expect(sellPlacement?.status).toBe('resting');
    expect(matching.submitted.every((s) => s.request.side === 'sell')).toBe(true);
  });
});
