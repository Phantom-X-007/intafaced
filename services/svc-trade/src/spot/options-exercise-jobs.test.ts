/**
 * R-E5 — JobHost invokes options exercise / assignment / expiry mill.
 *
 * Blank TRADE_OPTIONS_SETTLEMENT_FIXING refuses. Blank settlement asset
 * refuses. lastTrade / mark ignored. Env default stays empty. Listing SOCKET
 * stays closed. Three job names, one mill.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryLedger, parseAmount as amt } from '@intafaced/ledger-client';
import { OPTIONS_FIXING_UNCONFIGURED, OPTIONS_SETTLEMENT_LAW_UNSET } from './options-policy.js';
import { optionsAssignmentIdFor, optionsExerciseIdFor, optionsExpiryIdFor } from './options-exercise.js';
import { startOptionsExerciseJobs, runOptionsExerciseScan } from './options-exercise-jobs.js';

const here = dirname(fileURLToPath(import.meta.url));
const ALICE = '11111111-1111-4111-8111-111111111111';
const POS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MARKET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXPIRY = new Date('2026-12-26T08:00:00.000Z');
const AFTER = new Date('2026-12-26T08:00:01.000Z');
const P0_05_LAW = 'd26-p0-05-adr-published';

function captureIntervals() {
  const timers: Array<{ id: number; fn: () => unknown; ms: number }> = [];
  let nextId = 1;
  return {
    timers,
    setIntervalFn: ((fn: () => void, ms: number) => {
      const id = nextId++;
      timers.push({ id, fn, ms });
      return id as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval,
    clearIntervalFn: ((id: number) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    }) as typeof clearInterval,
  };
}

function longPosition() {
  return { positionId: POS, userId: ALICE, side: 'long' as const, size: amt('1') };
}

function mockSql() {
  return Object.assign((strings: TemplateStringsArray) => {
    void strings;
    return Promise.resolve([]);
  }, {}) as never;
}

describe('R-E5 JobHost options exercise source', () => {
  it('schedules exercise, assignment, expiry; never last-trade as owner price; listing SOCKET kept', () => {
    const jobs = readFileSync(join(here, 'options-exercise-jobs.ts'), 'utf8');
    expect(jobs).toMatch(/host\.every\('options\.exercise'/);
    expect(jobs).toMatch(/host\.every\('options\.assignment'/);
    expect(jobs).toMatch(/host\.every\('options\.expiry'/);
    expect(jobs).toMatch(/runOptionsExerciseScan/);
    expect(jobs).toMatch(/settlementFixingConfigured:\s*deps\.config\.settlementFixing/);
    expect(jobs).not.toMatch(/ownerSettlementPriceFor:\s*deps\.lastTradePrice/);
    expect(jobs).not.toMatch(/ownerSettlementPrice:\s*(deps\.)?lastTrade/);
    const mill = readFileSync(join(here, 'options-exercise.ts'), 'utf8');
    expect(mill).toMatch(/void input\.lastTradePrice/);
    expect(mill).not.toMatch(/recipes\./);
    const envSrc = readFileSync(join(here, '..', 'env.ts'), 'utf8');
    expect(envSrc).toMatch(/TRADE_OPTIONS_SETTLEMENT_FIXING:\s*z\.string\(\)\.default\(''\)/);
    expect(envSrc).toMatch(/TRADE_OPTIONS_JOBS_ENABLED/);
    const indexSrc = readFileSync(join(here, '..', 'index.ts'), 'utf8');
    expect(indexSrc).toMatch(/startOptionsExerciseJobs/);
    expect(indexSrc).toMatch(/settlementFixing:\s*env\.TRADE_OPTIONS_SETTLEMENT_FIXING/);
    expect(indexSrc).not.toMatch(/ownerSettlementPriceFor/);
    expect(indexSrc).not.toMatch(/TRADE_OPTIONS_SETTLEMENT_FIXING:\s*['"][0-9]/);
    const listing = readFileSync(join(here, 'options-listing.ts'), 'utf8');
    expect(listing).toMatch(/socket\.options-settlement-asset-law/);
  });
});

describe('R-E5 JobHost invokes exercise mill', () => {
  it('interval tick classifies owner decimal and ignores last trade 1 / mark 2; zero posts', async () => {
    const ledger = new MemoryLedger();
    const before = ledger.journal().length;
    const clock = captureIntervals();
    const millCalls = { n: 0 };
    const handle = startOptionsExerciseJobs({
      sql: mockSql(),
      ledger,
      now: () => AFTER,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      lastTradePrice: '1',
      markPrice: '2',
      ownerSettlementPriceFor: () => '110',
      settlementAssetFor: () => 'USD',
      exercise: {
        markets: {
          listExpiredOptions: async () => {
            millCalls.n += 1;
            return [
              {
                marketId: MARKET,
                kind: 'options',
                optionType: 'call',
                optionStyle: 'european',
                strike: amt('100'),
                expiryAt: EXPIRY,
              },
            ];
          },
        },
        positions: { listOpenForMarket: async () => [longPosition()] },
      },
      config: {
        enabled: true,
        intervalMs: 15_000,
        settlementAssetLaw: P0_05_LAW,
        settlementFixing: 'owner-stamp',
      },
    });
    expect(handle.host.list()).toEqual(['options.exercise', 'options.assignment', 'options.expiry']);
    expect(clock.timers[0]!.ms).toBe(15_000);
    await clock.timers[0]!.fn();
    expect(millCalls.n).toBe(1);
    expect(ledger.journal()).toHaveLength(before);
    expect(ledger.reconcile()).toEqual({ ok: true });
    expect(optionsExerciseIdFor(POS)).toBe(`option-exercise:${POS}`);
    expect(optionsAssignmentIdFor(POS)).toBe(`option-assign:${POS}`);
    expect(optionsExpiryIdFor(POS)).toBe(`option-expire:${POS}`);
    handle.stop();
  });

  it('blank TRADE_OPTIONS_SETTLEMENT_FIXING refuses the JobHost tick; last trade is not settlement', async () => {
    const ledger = new MemoryLedger();
    const before = ledger.journal().length;
    const clock = captureIntervals();
    let sawMarket = false;
    const handle = startOptionsExerciseJobs({
      sql: mockSql(),
      ledger,
      now: () => AFTER,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      lastTradePrice: '1',
      markPrice: '2',
      ownerSettlementPriceFor: () => '999',
      settlementAssetFor: () => 'USD',
      exercise: {
        markets: {
          listExpiredOptions: async () => {
            sawMarket = true;
            return [
              {
                marketId: MARKET,
                kind: 'options',
                optionType: 'call',
                optionStyle: 'european',
                strike: amt('100'),
                expiryAt: EXPIRY,
              },
            ];
          },
        },
        positions: { listOpenForMarket: async () => [longPosition()] },
      },
      config: {
        enabled: true,
        intervalMs: 15_000,
        settlementAssetLaw: P0_05_LAW,
        settlementFixing: '',
      },
    });
    const results = await runOptionsExerciseScan({
      now: AFTER,
      settlementAssetLawConfigured: P0_05_LAW,
      settlementFixingConfigured: '',
      ownerSettlementPriceFor: () => '999',
      settlementAssetFor: () => 'USD',
      lastTradePrice: '1',
      markPrice: '2',
      markets: {
        listExpiredOptions: async () => [
          {
            marketId: MARKET,
            kind: 'options',
            optionType: 'call',
            optionStyle: 'european',
            strike: amt('100'),
            expiryAt: EXPIRY,
          },
        ],
      },
      positions: { listOpenForMarket: async () => [longPosition()] },
      ledger,
    });
    expect(results).toEqual([{ status: 'refused', reason: 'fixing_unconfigured', code: OPTIONS_FIXING_UNCONFIGURED, posts: [] }]);
    await clock.timers[0]!.fn();
    expect(sawMarket).toBe(true);
    expect(ledger.journal()).toHaveLength(before);
    handle.stop();
  });

  it('blank settlement asset refuses law_unset; owner decimal is not enough', async () => {
    const ledger = new MemoryLedger();
    const results = await runOptionsExerciseScan({
      now: AFTER,
      settlementAssetLawConfigured: P0_05_LAW,
      settlementFixingConfigured: 'owner-stamp',
      ownerSettlementPriceFor: () => '110',
      settlementAssetFor: () => '',
      lastTradePrice: '1',
      markets: {
        listExpiredOptions: async () => [
          {
            marketId: MARKET,
            kind: 'options',
            optionType: 'call',
            optionStyle: 'european',
            strike: amt('100'),
            expiryAt: EXPIRY,
          },
        ],
      },
      positions: { listOpenForMarket: async () => [longPosition()] },
      ledger,
    });
    expect(results).toEqual([{ status: 'refused', reason: 'settlement_law_unset', code: OPTIONS_SETTLEMENT_LAW_UNSET, posts: [] }]);
    expect(ledger.journal()).toHaveLength(0);
  });

  it('disabled host schedules nothing', () => {
    const handle = startOptionsExerciseJobs({
      sql: mockSql(),
      ledger: new MemoryLedger(),
      config: { enabled: false, intervalMs: 15_000, settlementAssetLaw: P0_05_LAW, settlementFixing: 'x' },
    });
    expect(handle.host.list()).toEqual([]);
    handle.stop();
  });
});
