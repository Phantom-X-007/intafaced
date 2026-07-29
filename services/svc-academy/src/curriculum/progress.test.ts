import { describe, expect, it } from 'vitest';
import {
  assertUnlocked,
  certificationXp,
  certificationXpKey,
  nextItem,
  pathProgress,
  ProgressError,
  type PathItem,
} from './progress.js';

/**
 * STRUCTURED PATHS (§8.3 "paths sequenced by Blueprint").
 *
 * A path is a SEQUENCE. These tests are what stops it being a checklist someone
 * can complete out of order and still be certified for.
 */

const item = (id: string, position: number, over: Partial<PathItem> = {}): PathItem => ({
  id,
  position,
  kind: 'playbook',
  paperTrading: false,
  ...over,
});

/** Deliberately supplied out of order — callers may pass any order. */
const path: PathItem[] = [item('c', 3), item('a', 1), item('b', 2, { kind: 'workbook', paperTrading: true })];

const done = (...ids: string[]) => new Set(ids);

describe('nextItem', () => {
  it('starts at the lowest position regardless of input order', () => {
    expect(nextItem(path, done())?.id).toBe('a');
  });

  it('advances as items are completed', () => {
    expect(nextItem(path, done('a'))?.id).toBe('b');
    expect(nextItem(path, done('a', 'b'))?.id).toBe('c');
  });

  it('returns null once every item is done', () => {
    expect(nextItem(path, done('a', 'b', 'c'))).toBeNull();
  });

  /**
   * A learner who completed a later item out of band is pointed back at the
   * gap, not at the end — otherwise the sequence silently forgives itself.
   */
  it('points at the gap when a later item was completed first', () => {
    expect(nextItem(path, done('c'))?.id).toBe('a');
  });

  it('returns null for an empty path', () => {
    expect(nextItem([], done())).toBeNull();
  });
});

describe('assertUnlocked', () => {
  it('opens the first item immediately', () => {
    expect(assertUnlocked(path, done(), 'a').id).toBe('a');
  });

  it('refuses an item whose predecessors are unfinished', () => {
    expect(() => assertUnlocked(path, done(), 'c')).toThrow(ProgressError);
    try {
      assertUnlocked(path, done(), 'c');
    } catch (err) {
      expect((err as ProgressError).code).toBe('academy.item_locked');
    }
  });

  it('opens an item once everything before it is done', () => {
    expect(assertUnlocked(path, done('a'), 'b').id).toBe('b');
    expect(assertUnlocked(path, done('a', 'b'), 'c').id).toBe('c');
  });

  /** Revisiting a finished workbook is not an error. */
  it('allows re-completing an item already done', () => {
    expect(assertUnlocked(path, done('a'), 'a').id).toBe('a');
  });

  it('refuses an item that is not in the path at all', () => {
    try {
      assertUnlocked(path, done('a', 'b', 'c'), 'zzz');
      throw new Error('expected a refusal');
    } catch (err) {
      expect((err as ProgressError).code).toBe('academy.item_not_in_path');
    }
  });
});

describe('pathProgress', () => {
  it('reports nothing done at the start', () => {
    expect(pathProgress(path, done())).toMatchObject({ total: 3, completed: 0, percentBps: 0, nextItemId: 'a', finished: false });
  });

  /** 1/3 floors to 3333 bps — an integer, so two clients render the same bar. */
  it('floors the percentage to basis points', () => {
    expect(pathProgress(path, done('a')).percentBps).toBe(3333);
    expect(pathProgress(path, done('a', 'b')).percentBps).toBe(6666);
  });

  it('reports a finished path at exactly 100%', () => {
    expect(pathProgress(path, done('a', 'b', 'c'))).toMatchObject({
      completed: 3,
      percentBps: 10_000,
      nextItemId: null,
      finished: true,
    });
  });

  /**
   * An empty path is 0% and UNFINISHED. Reporting it complete would certify
   * people for a curriculum nobody has authored yet.
   */
  it('treats an empty path as unfinished, not complete', () => {
    expect(pathProgress([], done())).toMatchObject({ total: 0, completed: 0, percentBps: 0, finished: false });
  });
});

describe('certificationXp', () => {
  it('is the base plus a per-item share', () => {
    expect(certificationXp(path, { base: 100, perItem: 10 })).toBe(130);
  });

  it('grows with the length of the path', () => {
    const longer = [...path, item('d', 4)];
    expect(certificationXp(longer, { base: 100, perItem: 10 })).toBe(140);
  });

  it('is worth nothing for an empty path', () => {
    expect(certificationXp([], { base: 100, perItem: 10 })).toBe(0);
  });
});

describe('certificationXpKey', () => {
  /**
   * One certification per (curriculum, user), forever — a business key, so a
   * redelivered event finds the original award rather than inflating a rank.
   */
  it('is stable for the same curriculum and user', () => {
    expect(certificationXpKey('cur-1', 'user-1')).toBe(certificationXpKey('cur-1', 'user-1'));
  });

  it('separates users and curricula', () => {
    expect(certificationXpKey('cur-1', 'user-1')).not.toBe(certificationXpKey('cur-1', 'user-2'));
    expect(certificationXpKey('cur-1', 'user-1')).not.toBe(certificationXpKey('cur-2', 'user-1'));
  });
});
