/**
 * D26-P1-T1f public door — published rate is observable, tick settles, nets zero.
 *
 * Break class: public GET invents a rate the tick never saw · or tick settles
 * from a private source while public door shows nothing · or settled nets mint
 * money (sum ≠ 0).
 *
 * Same wiring shape as `index.ts`: memory rate book → `fundingRateForMarket`
 * peeks published entry → `runFundingTick` quotes the same book. No rate invent.
 */
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { parseAmount as amt, type PostRequest } from '@intafaced/ledger-client';
import { fakeMarket, registerPublicRest, type PublicRestDeps } from '../public-rest.js';
import { memoryFundingRateBook, periodIdFor } from './funding-rate-source.js';
import {
  assertFundingNetsZero,
  memoryFundingMarginApplier,
  memoryFundingPeriodStore,
  runFundingTick,
  sumFundingNets,
} from './funding-tick.js';
import type { FundingOpenPosition } from './funding-settlement.js';

/** Test-only magnitude bound — NOT product law (owner residual D2). */
const FIXTURE_FUNDING_MAX_ABS = '1';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const MARKET_ID = '11111111-1111-4111-8111-111111111111';
const SYMBOL = 'BTC/USDT-PERP';
const AT_MS = Date.parse('2026-08-12T08:00:00.000Z');
const PERIOD_START = '2026-08-12T00:00:00.000Z';

function longShort(): FundingOpenPosition[] {
  return [
    {
      positionId: 'plong',
      userId: A,
      side: 'long',
      size: amt('1'),
      entryPrice: amt('50000'),
      marginAsset: 'USDT',
    },
    {
      positionId: 'pshort',
      userId: B,
      side: 'short',
      size: amt('1'),
      entryPrice: amt('50000'),
      marginAsset: 'USDT',
    },
  ];
}

function basePublicDeps(overrides: Partial<PublicRestDeps> = {}): PublicRestDeps {
  const perp = fakeMarket({ id: MARKET_ID, symbol: SYMBOL, kind: 'futures' });
  return {
    markets: async () => [perp],
    marketBySymbol: async (s) => (s === SYMBOL ? perp : null),
    depth: async () => ({ bids: [], asks: [], sequence: 0 }),
    publicTape: async () => [],
    candles: async () => [],
    now: () => AT_MS,
    ...overrides,
  };
}

describe('D26-P1-T1f public doors — funding accrues, observable, nets zero', () => {
  it('publish → GET /funding-rate → tick settle → long/short nets sum to 0', async () => {
    const book = memoryFundingRateBook({ now: () => AT_MS });
    const periodId = periodIdFor(MARKET_ID, PERIOD_START);
    const publishedRate = '0.0001';

    // Oracle publish (never invent inside tick or public handler).
    book.set({
      marketId: MARKET_ID,
      rate: publishedRate,
      periodId,
      asOfMs: AT_MS,
    });

    const app = Fastify();
    registerPublicRest(
      app,
      basePublicDeps({
        fundingRateForMarket: async (marketId) => {
          const entry = book.peek(marketId);
          if (!entry) return null;
          return {
            fundingRate: entry.rate,
            fundingTimestamp: entry.asOfMs,
            fundingDatetime: new Date(entry.asOfMs).toISOString(),
            nextFundingTimestamp: null,
            markPrice: null,
            indexPrice: null,
          };
        },
      }),
    );
    await app.ready();

    const res = await app.inject({ method: 'GET', url: `/api/v1/funding-rate/${encodeURIComponent(SYMBOL)}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().fundingRate).toBe(publishedRate);
    await app.close();

    const margins = memoryFundingMarginApplier();
    const posts: PostRequest[] = [];
    const result = await runFundingTick(
      {
        rates: book.source({ maxAgeMs: 0 }),
        positions: {
          async listOpenForMarket() {
            return longShort();
          },
        },
        periods: memoryFundingPeriodStore(),
        margins,
        maxAbsRate: FIXTURE_FUNDING_MAX_ABS,
        ledger: {
          async post(req) {
            posts.push(req);
            return { id: req.idempotencyKey, idempotencyKey: req.idempotencyKey } as never;
          },
        },
        now: () => new Date(AT_MS),
      },
      MARKET_ID,
    );

    expect(result.status).toBe('settled');
    if (result.status === 'settled') {
      expect(result.periodId).toBe(periodId);
      expect(result.rate).toBe(publishedRate);
    }
    expect(posts).toHaveLength(1);

    const nets = [
      { positionId: 'plong', paid: margins.paidByPosition('plong') },
      { positionId: 'pshort', paid: margins.paidByPosition('pshort') },
    ];
    assertFundingNetsZero(nets);
    expect(sumFundingNets(nets)).toBe(0n);
    expect(nets[0]!.paid).toBe(amt('5'));
    expect(nets[1]!.paid).toBe(-amt('5'));
  });

  it('public door refuses when nothing published — tick skips (no invent, no nets)', async () => {
    const book = memoryFundingRateBook({ now: () => AT_MS });
    const app = Fastify();
    registerPublicRest(
      app,
      basePublicDeps({
        fundingRateForMarket: async (marketId) => {
          const entry = book.peek(marketId);
          if (!entry) return null;
          return {
            fundingRate: entry.rate,
            fundingTimestamp: entry.asOfMs,
            fundingDatetime: new Date(entry.asOfMs).toISOString(),
            nextFundingTimestamp: null,
            markPrice: null,
            indexPrice: null,
          };
        },
      }),
    );
    await app.ready();

    const res = await app.inject({ method: 'GET', url: `/api/v1/funding-rate/${encodeURIComponent(SYMBOL)}` });
    expect(res.statusCode).toBe(501);
    expect(res.json().intafacedCode).toBe('trade.funding_rate_unavailable');
    await app.close();

    const margins = memoryFundingMarginApplier();
    const result = await runFundingTick(
      {
        rates: book.source({ maxAgeMs: 0 }),
        positions: {
          async listOpenForMarket() {
            return longShort();
          },
        },
        periods: memoryFundingPeriodStore(),
        margins,
        maxAbsRate: FIXTURE_FUNDING_MAX_ABS,
        ledger: {
          async post() {
            throw new Error('must not post without a published rate');
          },
        },
        now: () => new Date(AT_MS),
      },
      MARKET_ID,
    );
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') expect(result.reason).toBe('no_rate');
    expect(margins.applied()).toHaveLength(0);
  });
});
