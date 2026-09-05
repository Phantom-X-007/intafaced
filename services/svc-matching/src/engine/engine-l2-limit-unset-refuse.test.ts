/**
 * Unit card — MatchingEngine depth limit unset refuse (no invented 50)
 *
 * 1. Promise: missing depth limit throws (never invent 50). Owner-explicit 50
 *    is a published window.
 * 2. Break: `depth(marketId, limit = 50)` republished 50 for tests/direct
 *    construction after public-query mill.
 * 3. Done bar: unset/null throw; 50 reads; engine.ts has no `limit = 50`.
 * 4. Class N
 * 5. Paths: engine.ts depth()
 * 6. RED: omitting limit returns a 50-level book
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function engine() {
  return new MatchingEngine({
    journal: new MemoryJournal(),
    bus: new MemoryEventBus('svc-matching'),
    snapshotEvery: 0,
  });
}

describe('MatchingEngine depth limit refuse-closed', () => {
  it('engine.ts has no invented 50 on depth()', () => {
    const src = readFileSync(join(HERE, 'engine.ts'), 'utf8');
    expect(src).not.toMatch(/depth\(marketId: MarketId, limit = 50\)/);
    expect(src).toMatch(/publishedEngineL2Limit/);
  });

  it('unset depth limit refuses (no invent 50)', () => {
    const live = engine();
    expect(() => live.depth('BTC-USDT')).toThrow(/refuse to invent 50/);
    expect(() => live.depth('BTC-USDT', undefined)).toThrow(/refuse to invent 50/);
  });

  it('null depth limit refuses (no invent 50)', () => {
    const live = engine();
    expect(() => live.depth('BTC-USDT', null)).toThrow(/refuse to invent 50/);
  });

  it('owner-explicit 50 is published (not invented)', () => {
    const live = engine();
    expect(live.depth('BTC-USDT', 50)).toBeNull();
  });
});
