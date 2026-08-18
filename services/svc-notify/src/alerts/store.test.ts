/**
 * Price-alert store list — status exact-match is part of the query, not a
 * post-filter of a mixed page. Memory and SQL share the same contract.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryAlertStore } from './store.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('MemoryAlertStore.list — status exact-match, self-only', () => {
  it('omitted status returns every watch owned by the caller', async () => {
    const store = new MemoryAlertStore();
    const a = await store.create({ userId: 'u1', marketId: 'BTC-USD', direction: 'above', targetPrice: '100' });
    const b = await store.create({ userId: 'u1', marketId: 'ETH-USD', direction: 'below', targetPrice: '50' });
    await store.cancel('u1', b.id);
    await store.create({ userId: 'u2', marketId: 'BTC-USD', direction: 'above', targetPrice: '90' });

    const items = await store.list('u1');
    expect(items.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(items.every((r) => r.userId === 'u1')).toBe(true);
  });

  it('status exact-matches in the store', async () => {
    const store = new MemoryAlertStore();
    const active = await store.create({ userId: 'u1', marketId: 'BTC-USD', direction: 'above', targetPrice: '100' });
    const cancelled = await store.create({ userId: 'u1', marketId: 'ETH-USD', direction: 'below', targetPrice: '50' });
    await store.cancel('u1', cancelled.id);
    await store.markFired('u1', active.id, new Date());

    const fired = await store.list('u1', 'fired');
    expect(fired).toHaveLength(1);
    expect(fired[0]!.id).toBe(active.id);
    expect(fired[0]!.status).toBe('fired');

    const cancelledRows = await store.list('u1', 'cancelled');
    expect(cancelledRows).toHaveLength(1);
    expect(cancelledRows[0]!.id).toBe(cancelled.id);
  });

  it('status miss returns empty items, never an invented row', async () => {
    const store = new MemoryAlertStore();
    await store.create({ userId: 'u1', marketId: 'BTC-USD', direction: 'above', targetPrice: '100' });
    expect(await store.list('u1', 'fired')).toEqual([]);
    expect(await store.list('u1', 'cancelled')).toEqual([]);
  });

  it('userId is part of the query — another owner never appears', async () => {
    const store = new MemoryAlertStore();
    const mine = await store.create({ userId: 'u1', marketId: 'BTC-USD', direction: 'above', targetPrice: '100' });
    const theirs = await store.create({ userId: 'u2', marketId: 'BTC-USD', direction: 'above', targetPrice: '100' });
    await store.markFired('u2', theirs.id, new Date());

    expect((await store.list('u1', 'active')).map((r) => r.id)).toEqual([mine.id]);
    expect(await store.list('u1', 'fired')).toEqual([]);
    expect((await store.list('u2', 'fired')).map((r) => r.id)).toEqual([theirs.id]);
  });
});

describe('PostgresAlertStore.list — status is a SQL predicate', () => {
  it('filters with AND status in the query, not after mapping a mixed page', () => {
    const src = readFileSync(join(here, 'store.ts'), 'utf8');
    const pg = src.slice(src.indexOf('export class PostgresAlertStore'), src.indexOf('function mapRow'));
    const list = pg.slice(pg.indexOf('async list('), pg.indexOf('async get('));
    expect(list).toMatch(/AND status = \$\{status\}/);
    expect(list).toMatch(/statusMatch/);
    expect(list).not.toMatch(/\.filter\(/);
  });
});
