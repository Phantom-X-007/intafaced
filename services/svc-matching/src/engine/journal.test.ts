import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileJournal, decodeAll } from './journal.js';

const completeLine = JSON.stringify({
  seq: 1,
  kind: 'submit',
  marketId: 'BTC/USDT',
  at: '2026-01-01T00:00:00.000Z',
  order: {
    orderId: '00000000-0000-4000-8000-000000000001',
    accountId: 'a',
    type: 'limit',
    side: 'buy',
    qty: '1',
    price: '100',
    stopPrice: null,
    tif: 'GTC',
  },
});

describe('decodeAll — crash mid-write residual', () => {
  it('skips a truncated last line so recovery can boot', () => {
    const body = `${completeLine}\n{"seq":2,"kind":"cancel","marketId":"BTC/USDT","at":"2026-01-01T00:00:01.000Z","orderId":"00000000-0000-4000-8000-000000000002`;
    const records = decodeAll(body);
    expect(records).toHaveLength(1);
    expect(records[0]!.seq).toBe(1);
  });

  it('still loads a complete journal that ends with a newline', () => {
    const records = decodeAll(`${completeLine}\n`);
    expect(records).toHaveLength(1);
  });

  it('throws on a corrupt line in the middle — that is not crash residue', () => {
    const body = `{not-json}\n${completeLine}\n`;
    expect(() => decodeAll(body)).toThrow();
  });
});

describe('FileJournal boot from a truncated file', () => {
  it('opens and reads past a partial tail without dying', () => {
    const dir = mkdtempSync(join(tmpdir(), 'matching-journal-'));
    const path = join(dir, 'engine.ndjson');
    writeFileSync(path, `${completeLine}\n{"seq":2,"kind":"cancel","marketId":"BTC/USDT","at":"x","orderId":"y`);

    const journal = new FileJournal(path);
    expect(journal.length).toBe(1);
    expect(journal.read()[0]!.seq).toBe(1);
    journal.close();
  });
});
