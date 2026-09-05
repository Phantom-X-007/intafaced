/**
 * Unit card — createDb max unset refuse (no invented 10)
 *
 * 1. Promise: missing max throws (never invent 10). Owner-explicit 10 is a
 *    published pool size. 0 is not a legal pool.
 * 2. Break: `max ?? 10` republishes 10 for tests/direct construction after
 *    env refuse (#4055). postgres.js also defaults omitted max to 10 — refuse
 *    before that library call. Indexer/protocol already pass env; this mill
 *    is the ctor.
 * 3. Done bar: unset/null throw; 0 throws; 10 constructs with max 10;
 *    connection.ts has no `?? 10` and requires `max: number`.
 * 4. Class N
 * 5. Paths: connection.ts createDb
 * 6. RED: `?? 10` returns, or omitting max constructs / postgres invents 10
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDb, type DbOptions } from './connection.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const BASE: Omit<DbOptions, 'max'> = {
  url: 'postgres://u:p@127.0.0.1:1/db',
  schema: 'ledger',
};

describe('createDb max ctor refuse-closed', () => {
  it('connection.ts has no invented 10 and requires max', () => {
    const src = readFileSync(join(HERE, 'connection.ts'), 'utf8');
    expect(src).not.toMatch(/options\.max\s*\?\?\s*10/);
    expect(src).not.toMatch(/max:\s*options\.max\s*\?\?\s*10/);
    expect(src).toMatch(/max:\s*number;/);
    expect(src).not.toMatch(/max\?:\s*number;/);
  });

  it('unset max refuses (no invent 10)', () => {
    expect(() => createDb({ ...BASE } as never, {})).toThrow(/createDb max is unset — refuse to invent 10/);
    expect(() => createDb({ ...BASE, max: undefined } as never, {})).toThrow(/refuse to invent 10/);
  });

  it('null max refuses (no invent 10)', () => {
    expect(() => createDb({ ...BASE, max: null } as never, {})).toThrow(/createDb max/);
  });

  it('explicit 0 refuses (0 is not a legal pool)', () => {
    expect(() => createDb({ ...BASE, max: 0 }, {})).toThrow(/not a legal pool/);
  });

  it('owner-explicit 10 is published (not invented)', async () => {
    const db = createDb({ ...BASE, max: 10 }, {});
    try {
      expect(db.sql.options.max).toBe(10);
    } finally {
      await db.close();
    }
  });
});
