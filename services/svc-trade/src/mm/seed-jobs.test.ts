import { describe, expect, it } from 'vitest';
import { MemoryLedger, parseAmount as amt, recipes } from '@intafaced/ledger-client';
import type { EngineDepth, EngineSubmitRequest, EngineSubmitResult, MatchingClient } from '../spot/matching-client.js';
import { parseMmSeedMids, parseMmSeedTargets, startMmSeedJobs } from './seed-jobs.js';
import { MM_MATCHING_ACCOUNT_ID } from './seed-market.js';

class JobStubMatching implements Pick<MatchingClient, 'submit' | 'depth'> {
  readonly submitted: Array<{ marketId: string; request: EngineSubmitRequest }> = [];
  depthReply: EngineDepth = { bids: [], asks: [], sequence: 0 };
  private seq = 0;

  async depth(_marketId: string, _limit?: number): Promise<EngineDepth> {
    return this.depthReply;
  }

  async submit(marketId: string, request: EngineSubmitRequest): Promise<EngineSubmitResult> {
    this.submitted.push({ marketId, request });
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

describe('parseMmSeedTargets', () => {
  it('parses marketId:base:quote list; empty → []', () => {
    expect(parseMmSeedTargets('')).toEqual([]);
    expect(parseMmSeedTargets(undefined)).toEqual([]);
    expect(parseMmSeedTargets('btc-usdt:BTC:USDT, eth-usdt:ETH:USDT')).toEqual([
      { marketId: 'btc-usdt', baseAsset: 'BTC', quoteAsset: 'USDT' },
      { marketId: 'eth-usdt', baseAsset: 'ETH', quoteAsset: 'USDT' },
    ]);
    // bad segments skipped
    expect(parseMmSeedTargets('only-two:parts,ok:A:B')).toEqual([{ marketId: 'ok', baseAsset: 'A', quoteAsset: 'B' }]);
  });
});

describe('parseMmSeedMids', () => {
  it('parses mid map; never invents', () => {
    expect(parseMmSeedMids('')).toEqual(new Map());
    const m = parseMmSeedMids('btc-usdt:100,eth-usdt:3000');
    expect(m.get('btc-usdt')).toBe('100');
    expect(m.get('eth-usdt')).toBe('3000');
    expect(m.get('missing')).toBeUndefined();
  });
});

describe('startMmSeedJobs', () => {
  it('disabled or empty targets → no scheduled jobs', () => {
    const host1 = startMmSeedJobs({
      ledger: new MemoryLedger(),
      matching: new JobStubMatching(),
      midSource: () => '100',
      config: {
        enabled: false,
        intervalMs: 1000,
        halfSpreadBps: 10,
        stepBps: 10,
        levels: 1,
        qtyPerLevel: '1',
        targets: [{ marketId: 'm', baseAsset: 'BTC', quoteAsset: 'USDT' }],
      },
    });
    expect(host1.host.list()).toEqual([]);
    host1.stop();

    const host2 = startMmSeedJobs({
      ledger: new MemoryLedger(),
      matching: new JobStubMatching(),
      midSource: () => '100',
      config: {
        enabled: true,
        intervalMs: 1000,
        halfSpreadBps: 10,
        stepBps: 10,
        levels: 1,
        qtyPerLevel: '1',
        targets: [],
      },
    });
    expect(host2.host.list()).toEqual([]);
    host2.stop();
  });

  it('tick seeds empty book with external mid under house:market-maker', async () => {
    const matching = new JobStubMatching();
    const ledger = new MemoryLedger();
    await ledger.post(recipes.marketMakerSeedFund({ assetId: 'USDT', amount: amt('10000'), seedId: 'k1' }));
    await ledger.post(recipes.marketMakerSeedFund({ assetId: 'BTC', amount: amt('100'), seedId: 'k2' }));

    await new Promise<void>((resolve, reject) => {
      const h = startMmSeedJobs({
        ledger,
        matching,
        midSource: () => '100',
        config: {
          enabled: true,
          intervalMs: 20,
          halfSpreadBps: 100,
          stepBps: 0,
          levels: 1,
          qtyPerLevel: '1',
          targets: [{ marketId: 'btc-usdt', baseAsset: 'BTC', quoteAsset: 'USDT' }],
        },
        onResult: (marketId, result) => {
          try {
            expect(marketId).toBe('btc-usdt');
            expect('ok' in result && result.ok).toBe(true);
            expect(matching.submitted.length).toBe(2);
            expect(matching.submitted.every((s) => s.request.accountId === MM_MATCHING_ACCOUNT_ID)).toBe(true);
            expect(matching.submitted.every((s) => s.request.tif === 'PO')).toBe(true);
            h.stop();
            resolve();
          } catch (e) {
            h.stop();
            reject(e);
          }
        },
      });
      expect(h.host.list()).toEqual(['mm.seed']);
      setTimeout(() => {
        h.stop();
        reject(new Error('tick timeout'));
      }, 2000);
    });
  });

  it('skips when book already has depth (no re-seed race)', async () => {
    const matching = new JobStubMatching();
    matching.depthReply = { bids: [['99', '1']], asks: [['101', '1']], sequence: 1 };
    const ledger = new MemoryLedger();

    await new Promise<void>((resolve, reject) => {
      const h = startMmSeedJobs({
        ledger,
        matching,
        midSource: () => '100',
        config: {
          enabled: true,
          intervalMs: 20,
          halfSpreadBps: 100,
          stepBps: 0,
          levels: 1,
          qtyPerLevel: '1',
          targets: [{ marketId: 'btc-usdt', baseAsset: 'BTC', quoteAsset: 'USDT' }],
        },
        onResult: (_id, result) => {
          try {
            expect('skipped' in result && result.skipped).toBe('book_not_empty');
            expect(matching.submitted).toHaveLength(0);
            h.stop();
            resolve();
          } catch (e) {
            h.stop();
            reject(e);
          }
        },
      });
      setTimeout(() => {
        h.stop();
        reject(new Error('tick timeout'));
      }, 2000);
    });
  });

  it('skips missing mid — no submit', async () => {
    const matching = new JobStubMatching();
    const ledger = new MemoryLedger();

    await new Promise<void>((resolve, reject) => {
      const h = startMmSeedJobs({
        ledger,
        matching,
        midSource: () => null,
        config: {
          enabled: true,
          intervalMs: 20,
          halfSpreadBps: 100,
          stepBps: 0,
          levels: 1,
          qtyPerLevel: '1',
          targets: [{ marketId: 'btc-usdt', baseAsset: 'BTC', quoteAsset: 'USDT' }],
        },
        onResult: (_id, result) => {
          try {
            expect('skipped' in result && result.skipped).toBe('missing_mid');
            expect(matching.submitted).toHaveLength(0);
            h.stop();
            resolve();
          } catch (e) {
            h.stop();
            reject(e);
          }
        },
      });
      setTimeout(() => {
        h.stop();
        reject(new Error('tick timeout'));
      }, 2000);
    });
  });
});
