import { describe, expect, it } from 'vitest';
import { formatAmount, marketMaker, MemoryLedger, parseAmount as amt, recipes } from '@intafaced/ledger-client';
import type { EngineCancelResult, EngineDepth, EngineSubmitRequest, EngineSubmitResult, MatchingClient } from '../spot/matching-client.js';
import { parseMmSeedMids, parseMmSeedTargets, startMmSeedJobs } from './seed-jobs.js';
import { MM_MATCHING_ACCOUNT_ID } from './seed-market.js';

class JobStubMatching implements Pick<MatchingClient, 'submit' | 'depth' | 'cancel'> {
  readonly submitted: Array<{ marketId: string; request: EngineSubmitRequest }> = [];
  readonly cancelled: string[] = [];
  readonly live = new Set<string>();
  depthReply: EngineDepth = { bids: [], asks: [], sequence: 0 };
  private seq = 0;
  /** When true, depth follows live set (empty when no live orders). */
  trackDepthFromLive = false;

  async depth(_marketId: string, _limit?: number): Promise<EngineDepth> {
    if (this.trackDepthFromLive) {
      if (this.live.size === 0) return { bids: [], asks: [], sequence: this.seq };
      return { bids: [['99', '1']], asks: [['101', '1']], sequence: this.seq };
    }
    return this.depthReply;
  }

  async submit(marketId: string, request: EngineSubmitRequest): Promise<EngineSubmitResult> {
    this.submitted.push({ marketId, request });
    const sequence = ++this.seq;
    this.live.add(request.orderId);
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

  async cancel(_marketId: string, orderId: string): Promise<EngineCancelResult> {
    this.cancelled.push(orderId);
    if (!this.live.has(orderId)) {
      return { cancelled: false, orderId, sequence: null, cancellation: null };
    }
    this.live.delete(orderId);
    const sequence = ++this.seq;
    return {
      cancelled: true,
      orderId,
      sequence,
      cancellation: {
        orderId,
        accountId: MM_MATCHING_ACCOUNT_ID,
        remainingQty: '1',
        sequence,
        reason: 'requested',
      },
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

  it('cancel+reseed when book empty after levels cleared — new runId, holds redrawn', async () => {
    const matching = new JobStubMatching();
    matching.trackDepthFromLive = true;
    const ledger = new MemoryLedger();
    await ledger.post(recipes.marketMakerSeedFund({ assetId: 'USDT', amount: amt('10000'), seedId: 'rs1' }));
    await ledger.post(recipes.marketMakerSeedFund({ assetId: 'BTC', amount: amt('100'), seedId: 'rs2' }));

    let seedCount = 0;
    let cancelCount = 0;
    const runIds: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const h = startMmSeedJobs({
        ledger,
        matching,
        midSource: () => '100',
        config: {
          enabled: true,
          intervalMs: 25,
          halfSpreadBps: 100,
          stepBps: 0,
          levels: 1,
          qtyPerLevel: '1',
          targets: [{ marketId: 'btc-usdt', baseAsset: 'BTC', quoteAsset: 'USDT' }],
        },
        runIdFor: (marketId) => {
          const id = `ops-seed:${marketId}:g${runIds.length + 1}`;
          runIds.push(id);
          return id;
        },
        onCancelResult: () => {
          cancelCount += 1;
        },
        onResult: async (_id, result) => {
          try {
            if ('skipped' in result) {
              // book_not_empty between first seed and clear is fine
              return;
            }
            if (!('ok' in result) || !result.ok) {
              h.stop();
              reject(new Error(`unexpected seed fail: ${'reason' in result ? result.reason : '?'}`));
              return;
            }
            seedCount += 1;
            if (seedCount === 1) {
              expect(matching.submitted).toHaveLength(2);
              expect(matching.live.size).toBe(2);
              // Simulate levels cancelled / filled — book empty, holds still present
              matching.live.clear();
              return;
            }
            if (seedCount === 2) {
              expect(cancelCount).toBeGreaterThanOrEqual(1);
              expect(runIds[0]).not.toBe(runIds[1]);
              // second seed used new order ids (4 submits total)
              expect(matching.submitted.length).toBe(4);
              expect(matching.cancelled.length).toBe(2);
              // pot still drawn for live second seed
              expect(formatAmount((await ledger.balance(marketMaker('USDT'))).amount)).toBe('9901');
              expect(formatAmount((await ledger.balance(marketMaker('BTC'))).amount)).toBe('99');
              h.stop();
              resolve();
            }
          } catch (e) {
            h.stop();
            reject(e);
          }
        },
      });
      setTimeout(() => {
        h.stop();
        reject(new Error(`reseed timeout seedCount=${seedCount} cancelCount=${cancelCount}`));
      }, 3000);
    });
  });
});
