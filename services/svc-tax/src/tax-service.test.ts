import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import {
  TAX_DATA_LAKE_UNAVAILABLE,
  TAX_DATA_LAKE_UNPROBED,
  TAX_EXPORT_INCOMPLETE,
  TAX_HISTORY_YEARS_UNSET,
  TAX_INDEXER_UNAVAILABLE,
  TAX_INDEXER_UNPROBED,
  TAX_JURISDICTION_UNMAPPED,
  TAX_LOT_METHOD_REQUIRED,
} from './codes.js';
import type { HistoryEntry, HistoryRange, TaxBalance, TaxLedgerReads } from './ledger-reads.js';
import { indexerStatusFromUrl, lakeStatusFromUrl, requirePublishedHistoryYears, TaxService } from './tax-service.js';

/** Owner-published window in tests — not a production default. */
const OWNER_HISTORY_YEARS = 10;

const USER = '11111111-1111-4111-8111-111111111111';

function emptyReads(): TaxLedgerReads {
  return {
    async balances() {
      return [];
    },
    async history() {
      return [];
    },
  };
}

function books(): TaxLedgerReads {
  const account = { ownerType: 'user' as const, ownerId: USER, assetId: 'BTC', kind: 'available' as const };
  const balances: TaxBalance[] = [{ account, accountId: 'acc-btc', amount: parseAmount('1') }];
  const history: HistoryEntry[] = [
    {
      txId: 'tx-1',
      module: 'ledger',
      reason: 'deposit.credited',
      direction: 'debit',
      amount: parseAmount('1'),
      postedAt: new Date('2024-01-01T00:00:00.000Z'),
    },
  ];
  return {
    async balances() {
      return balances;
    },
    async history() {
      return history;
    },
  };
}

describe('TaxService', () => {
  it('blank owner map refuses tax.jurisdiction_unmapped', async () => {
    const tax = new TaxService({
      mapRaw: '',
      reads: emptyReads(),
      lake: { status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE },
      indexer: { status: 'absent', code: TAX_INDEXER_UNAVAILABLE },
    });
    await expect(tax.exportPreview({ userId: USER, region: 'DE', lotMethod: 'FIFO' })).rejects.toMatchObject({
      code: TAX_JURISDICTION_UNMAPPED,
    });
  });

  it('caller must select a lot method — no silent default', async () => {
    const tax = new TaxService({
      mapRaw: '["DE"]',
      reads: emptyReads(),
      lake: { status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE },
      indexer: { status: 'absent', code: TAX_INDEXER_UNAVAILABLE },
    });
    await expect(tax.exportPack({ userId: USER, region: 'DE', lotMethod: '' })).rejects.toMatchObject({
      code: TAX_LOT_METHOD_REQUIRED,
    });
  });

  it('unset history years refuses tax.history_years_unset — never invent 10', async () => {
    const tax = new TaxService({
      mapRaw: '["DE"]',
      reads: emptyReads(),
      lake: { status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE },
      indexer: { status: 'absent', code: TAX_INDEXER_UNAVAILABLE },
    });
    await expect(tax.exportPreview({ userId: USER, region: 'DE', lotMethod: 'FIFO' })).rejects.toMatchObject({
      code: TAX_HISTORY_YEARS_UNSET,
    });
  });

  it('owner-published 10 is the window, not an invented default', async () => {
    const account = { ownerType: 'user' as const, ownerId: USER, assetId: 'BTC', kind: 'available' as const };
    let captured: HistoryRange | undefined;
    const reads: TaxLedgerReads = {
      async balances() {
        return [{ account, accountId: 'acc-btc', amount: parseAmount('1') }];
      },
      async history(_account, range) {
        captured = range;
        return [];
      },
    };
    const tax = new TaxService({
      mapRaw: '["DE"]',
      reads,
      lake: { status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE },
      indexer: { status: 'absent', code: TAX_INDEXER_UNAVAILABLE },
      historyYears: OWNER_HISTORY_YEARS,
      now: () => new Date('2026-01-02T00:00:00.000Z'),
    });
    await tax.exportPack({ userId: USER, region: 'DE', lotMethod: 'FIFO' });
    expect(captured?.from.toISOString()).toBe('2016-01-01T00:00:00.000Z');
    expect(captured?.to.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('empty books return an empty pack, not $0 PnL, and name the missing lake', async () => {
    const tax = new TaxService({
      mapRaw: '{"DE":{}}',
      reads: emptyReads(),
      lake: { status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE },
      indexer: { status: 'absent', code: TAX_INDEXER_UNAVAILABLE },
      historyYears: OWNER_HISTORY_YEARS,
      now: () => new Date('2026-01-02T00:00:00.000Z'),
    });
    const pack = await tax.exportPack({ userId: USER, region: 'DE', lotMethod: 'FIFO' });
    expect(pack.empty).toBe(true);
    expect(pack.realized).toBeNull();
    expect(pack.unrealized).toBeNull();
    expect(pack.lotCount).toBe(0);
    expect(pack.lake).toEqual({ status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE });
    expect(pack.indexer).toEqual({ status: 'absent', code: TAX_INDEXER_UNAVAILABLE });
    expect(pack.mime).toBe('application/json');
    const body = JSON.parse(Buffer.from(pack.bodyBase64, 'base64').toString('utf8')) as { realized: unknown; note: string };
    expect(body.realized).toBeNull();
    expect(body.note).toMatch(/empty book/);
    expect(JSON.stringify(body)).not.toMatch(/"realized": "0"/);
  });

  it('ledger history without basis does not invent a FIFO closed lot', async () => {
    const account = { ownerType: 'user' as const, ownerId: USER, assetId: 'BTC', kind: 'available' as const };
    const reads: TaxLedgerReads = {
      async balances() {
        return [{ account, accountId: 'acc-btc', amount: parseAmount('0') }];
      },
      async history() {
        return [
          {
            txId: 'a1',
            module: 'ledger',
            reason: 'deposit.credited',
            direction: 'debit',
            amount: parseAmount('1'),
            postedAt: new Date('2024-01-01T00:00:00.000Z'),
          },
          {
            txId: 'd1',
            module: 'ledger',
            reason: 'trade.fill',
            direction: 'credit',
            amount: parseAmount('1'),
            postedAt: new Date('2024-02-01T00:00:00.000Z'),
          },
        ];
      },
    };
    const tax = new TaxService({
      mapRaw: '["DE"]',
      reads,
      lake: { status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE },
      indexer: { status: 'absent', code: TAX_INDEXER_UNAVAILABLE },
      historyYears: OWNER_HISTORY_YEARS,
    });
    const pack = await tax.exportPack({ userId: USER, region: 'DE', lotMethod: 'FIFO' });
    const body = JSON.parse(Buffer.from(pack.bodyBase64, 'base64').toString('utf8')) as {
      lotsClosed: unknown[];
      lotsOpen: Array<{ costBasis: string | null }>;
      realized: string | null;
      residuals: string[];
    };
    expect(body.lotsClosed).toEqual([]);
    expect(body.lotsOpen.every((lot) => lot.costBasis === null)).toBe(true);
    expect(body.realized).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/"costBasis": "0"/);
    expect(body.residuals).toContain('tax.cost_basis_unavailable');
  });

  it('mapped region + FIFO returns amounts as strings', async () => {
    const tax = new TaxService({
      mapRaw: '["DE"]',
      reads: books(),
      lake: { status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE },
      indexer: { status: 'absent', code: TAX_INDEXER_UNAVAILABLE },
      historyYears: OWNER_HISTORY_YEARS,
    });
    const preview = await tax.exportPreview({ userId: USER, region: 'DE', lotMethod: 'FIFO' });
    expect(preview.empty).toBe(false);
    expect(preview.lotCount).toBe(1);
    expect(preview.jurisdiction).toBe('DE');
    expect(typeof preview.lotCount).toBe('number');
    expect(preview.realized).toBeNull();
    expect(preview.complete).toBe(false);
    expect(preview.residuals).toContain(TAX_EXPORT_INCOMPLETE);
  });

  it('export door never claims complete — complete:true is tax.export_incomplete', async () => {
    const tax = new TaxService({
      mapRaw: '["DE"]',
      reads: books(),
      lake: { status: 'configured', code: TAX_DATA_LAKE_UNPROBED },
      indexer: { status: 'configured', code: TAX_INDEXER_UNPROBED },
      historyYears: OWNER_HISTORY_YEARS,
    });
    await expect(tax.exportPack({ userId: USER, region: 'DE', lotMethod: 'FIFO', complete: true })).rejects.toMatchObject({
      code: TAX_EXPORT_INCOMPLETE,
    });
    const preview = await tax.exportPreview({ userId: USER, region: 'DE', lotMethod: 'FIFO' });
    expect(preview.complete).toBe(false);
    const pack = await tax.exportPack({ userId: USER, region: 'DE', lotMethod: 'FIFO' });
    expect(pack.complete).toBe(false);
    const body = JSON.parse(Buffer.from(pack.bodyBase64, 'base64').toString('utf8')) as {
      complete: boolean;
      jurisdiction: string;
    };
    expect(body.complete).toBe(false);
    expect(body.jurisdiction).toBe('DE');
    expect(JSON.stringify(body)).not.toMatch(/"complete": true/);
    expect(pack.lake).toEqual({ status: 'configured', code: TAX_DATA_LAKE_UNPROBED });
    expect(pack.indexer).toEqual({ status: 'configured', code: TAX_INDEXER_UNPROBED });
    expect(JSON.stringify(body)).not.toMatch(/"status":"ok"/);
  });
});

describe('Q-tax — env URL is not a live lake/indexer', () => {
  it('blank URL is absent, not ok', () => {
    expect(lakeStatusFromUrl(undefined)).toEqual({ status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE });
    expect(lakeStatusFromUrl('')).toEqual({ status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE });
    expect(lakeStatusFromUrl('   ')).toEqual({ status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE });
    expect(indexerStatusFromUrl(undefined)).toEqual({ status: 'absent', code: TAX_INDEXER_UNAVAILABLE });
  });

  it('a set URL is configured/unprobed — never ok', () => {
    expect(lakeStatusFromUrl('http://lake.example/tsdb')).toEqual({
      status: 'configured',
      code: TAX_DATA_LAKE_UNPROBED,
    });
    expect(indexerStatusFromUrl('http://indexer.example')).toEqual({
      status: 'configured',
      code: TAX_INDEXER_UNPROBED,
    });
    expect(JSON.stringify(lakeStatusFromUrl('http://lake.example/tsdb'))).not.toMatch(/"ok"/);
    expect(JSON.stringify(indexerStatusFromUrl('http://indexer.example'))).not.toMatch(/"ok"/);
  });
});

describe('requirePublishedHistoryYears', () => {
  it('unset / NaN / 0 / 101 refuse by name — never invent 10', () => {
    for (const value of [undefined, Number.NaN, 0, 101] as const) {
      try {
        requirePublishedHistoryYears(value);
        expect.unreachable('expected refuse');
      } catch (err) {
        expect(err).toMatchObject({ code: TAX_HISTORY_YEARS_UNSET });
      }
    }
  });

  it('explicit owner pin 10 is accepted (not invented)', () => {
    expect(requirePublishedHistoryYears(10)).toBe(10);
  });
});
