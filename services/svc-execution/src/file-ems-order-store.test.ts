import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { FileEmsOrderStore } from './file-ems-order-store.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempStorePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ems-file-'));
  dirs.push(dir);
  return join(dir, 'ems-acks.jsonl');
}

function sampleExecution(venueOrderId = 'v-1') {
  return {
    venueId: 'binance-spot',
    venueOrderId,
    filledAmount: parseAmount('1'),
    averagePrice: parseAmount('100'),
    feeAmount: parseAmount('0'),
    feeAsset: 'USDT',
    status: 'filled' as const,
    executedAt: new Date('2026-08-22T00:00:00.000Z'),
  };
}

describe('FileEmsOrderStore', () => {
  it('record + get round-trip on disk', () => {
    const path = tempStorePath();
    const store = new FileEmsOrderStore(path);
    store.record({
      clientOrderId: 'client-1',
      venueId: 'binance-spot',
      symbol: 'BTC/USDT',
      side: 'buy',
      execution: sampleExecution(),
      recordedAtMs: 1,
    });
    expect(store.get('client-1')?.venueId).toBe('binance-spot');
    const reloaded = new FileEmsOrderStore(path);
    expect(reloaded.get('client-1')?.symbol).toBe('BTC/USDT');
  });

  it('duplicate clientOrderId overwrites in memory — latest wins on reload', () => {
    const path = tempStorePath();
    const store = new FileEmsOrderStore(path);
    store.record({
      clientOrderId: 'client-dup',
      venueId: 'binance-spot',
      symbol: 'ETH/USDT',
      side: 'sell',
      execution: sampleExecution('v-1'),
      recordedAtMs: 1,
    });
    store.record({
      clientOrderId: 'client-dup',
      venueId: 'bybit-spot',
      symbol: 'ETH/USDT',
      side: 'sell',
      execution: sampleExecution('v-2'),
      recordedAtMs: 2,
    });
    expect(readFileSync(path, 'utf8').trim().split('\n')).toHaveLength(2);
    const reloaded = new FileEmsOrderStore(path);
    expect(reloaded.get('client-dup')?.venueId).toBe('bybit-spot');
  });

  it('list filters by venue and symbol', () => {
    const store = new FileEmsOrderStore(tempStorePath());
    store.record({ clientOrderId: 'a', venueId: 'binance-spot', symbol: 'BTC/USDT', side: 'buy', execution: sampleExecution() });
    store.record({ clientOrderId: 'b', venueId: 'bybit-spot', symbol: 'BTC/USDT', side: 'buy', execution: sampleExecution() });
    expect(store.list({ venueId: 'binance-spot' })).toHaveLength(1);
    expect(store.list({ symbol: 'BTC/USDT' })).toHaveLength(2);
  });

  it('persists an outcome-unknown child without inventing an execution and indexes its reconciliation key', () => {
    const path = tempStorePath();
    const store = new FileEmsOrderStore(path);
    store.record({
      clientOrderId: 'parent-1/client/leg-1-0',
      parentClientOrderId: 'parent-1',
      executionGroupId: 'group-1',
      childOrderId: 'group-1/child/leg-1-0',
      legIndex: 1,
      venueId: 'bybit-spot',
      symbol: 'BTC/USDT',
      side: 'buy',
      execution: null,
      state: 'SUBMIT_UNKNOWN',
      reconciliationKey: 'lookup:parent-1/client/leg-1-0',
      recordedAtMs: 3,
    });
    const reloaded = new FileEmsOrderStore(path);
    expect(reloaded.get('parent-1/client/leg-1-0')).toMatchObject({ state: 'SUBMIT_UNKNOWN', execution: null });
    expect(reloaded.getByReconciliationKey('lookup:parent-1/client/leg-1-0')?.childOrderId).toBe('group-1/child/leg-1-0');
  });
});
