import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

const partialTail = '{"seq":2,"kind":"cancel","marketId":"BTC/USDT","at":"x","orderId":"y';

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
    writeFileSync(path, `${completeLine}\n${partialTail}`);

    const journal = new FileJournal(path);
    expect(journal.length).toBe(1);
    expect(journal.read()[0]!.seq).toBe(1);
    journal.close();
  });

  /**
   * W9 residual — #1520 made decode skip a torn last line, but FileJournal
   * still opened O_APPEND on the raw file. The next durable append glued onto
   * the partial bytes, so a later boot either skipped a real record or threw
   * mid-file corruption and refused recovery.
   */
  it('rewrites a clean file so appends after a truncated boot stay bootable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'matching-journal-'));
    const path = join(dir, 'engine.ndjson');
    writeFileSync(path, `${completeLine}\n${partialTail}`);

    const j1 = new FileJournal(path);
    expect(j1.length).toBe(1);
    const appended = j1.append({
      kind: 'cancel',
      marketId: 'BTC/USDT',
      at: '2026-01-01T00:00:02.000Z',
      orderId: '00000000-0000-4000-8000-000000000003',
    });
    expect(appended.seq).toBe(2);
    j1.close();

    // On-disk body must decode cleanly — no glued partial + new line.
    const raw = readFileSync(path, 'utf8');
    expect(() => decodeAll(raw)).not.toThrow();
    expect(decodeAll(raw).map((r) => r.seq)).toEqual([1, 2]);
    expect(raw).not.toContain(partialTail);

    const j2 = new FileJournal(path);
    expect(j2.length).toBe(2);
    expect(j2.read().map((r) => r.seq)).toEqual([1, 2]);
    j2.close();
  });

  it('refuses a short journal write before claiming durability', () => {
    const dir = mkdtempSync(join(tmpdir(), 'matching-journal-'));
    const path = join(dir, 'engine.ndjson');
    writeFileSync(path, `${completeLine}\n`);

    const journal = new FileJournal(path);
    // Force a short write by stubbing writeSync via monkey-patch is brittle;
    // the public contract is: a failed append must not grow read() length.
    // Exercised with a closed fd after close — write must throw, length stays 1.
    journal.close();
    expect(() =>
      journal.append({
        kind: 'cancel',
        marketId: 'BTC/USDT',
        at: '2026-01-01T00:00:03.000Z',
        orderId: '00000000-0000-4000-8000-000000000004',
      }),
    ).toThrow();
    expect(journal.length).toBe(1);
  });
});
