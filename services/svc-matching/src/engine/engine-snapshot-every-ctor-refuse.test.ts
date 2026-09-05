/**
 * Unit card — MatchingEngine ctor snapshotEvery unset refuse (no invented 500)
 *
 * 1. Promise: missing snapshotEvery throws (never invent 500). Owner-explicit
 *    500 is a published cadence. Owner-explicit 0 disables.
 * 2. Break: `snapshotEvery ?? 500` republishes 500 for tests/direct construction
 *    after env refuse (#4048). Index always passes env; this mill is the ctor.
 * 3. Done bar: unset/null throw; 500 and 0 construct; engine.ts has no `?? 500`.
 * 4. Class N
 * 5. Paths: engine.ts constructor
 * 6. RED: `?? 500` returns, or omitting snapshotEvery constructs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function stubs() {
  return { journal: new MemoryJournal(), bus: new MemoryEventBus('svc-matching') };
}

describe('MatchingEngine snapshotEvery ctor refuse-closed', () => {
  it('engine.ts has no invented 500 and requires snapshotEvery', () => {
    const src = readFileSync(join(HERE, 'engine.ts'), 'utf8');
    expect(src).not.toMatch(/snapshotEvery\s*\?\?\s*500/);
    expect(src).toMatch(/readonly snapshotEvery:\s*number;/);
    expect(src).not.toMatch(/readonly snapshotEvery\?:\s*number;/);
  });

  it('unset snapshotEvery refuses (no invent 500)', () => {
    const { journal, bus } = stubs();
    expect(() => new MatchingEngine({ journal, bus } as never)).toThrow(/snapshotEvery/);
    expect(() => new MatchingEngine({ journal, bus, snapshotEvery: undefined } as never)).toThrow(/refuse to invent 500/);
  });

  it('null snapshotEvery refuses (no invent 500)', () => {
    const { journal, bus } = stubs();
    expect(() => new MatchingEngine({ journal, bus, snapshotEvery: null } as never)).toThrow(/snapshotEvery/);
  });

  it('owner-explicit 500 is published (not invented)', () => {
    const { journal, bus } = stubs();
    expect(new MatchingEngine({ journal, bus, snapshotEvery: 500 })).toBeInstanceOf(MatchingEngine);
  });

  it('owner-explicit 0 disables snapshotting (constructs; 0 is not unset)', () => {
    const { journal, bus } = stubs();
    expect(new MatchingEngine({ journal, bus, snapshotEvery: 0 })).toBeInstanceOf(MatchingEngine);
  });
});
