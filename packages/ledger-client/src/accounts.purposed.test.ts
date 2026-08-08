import { describe, expect, it } from 'vitest';
import * as accounts from './accounts.js';
import { LOCK_KINDS } from './client.js';
import type { AccountRef } from './types.js';

/**
 * EVERY LOCK-KIND BUILDER NAMES ITS CLAIM — checked over the module, not a list.
 *
 * `assertPurposedLocks` refuses to post a `hold` / `escrow` / `stake` /
 * `collateral` account that carries no purpose, and `accounts.ts` explains why
 * at length: an unpurposed collateral pot means releasing loan A's collateral
 * can hand back value that was securing loan B, and both postings balance while
 * it happens.
 *
 * That guard fires at post time. A *constructor* that builds an unpurposed lock
 * is therefore a function whose every output is rejected — the exact shape of
 * the refusal code that was declared and never emitted (#1035), and of
 * `subAccountHold`, which this test was written against: it returned
 * `kind: 'hold'` with no purpose, so any caller would have got a refusal four
 * layers down, at run time, from a function that compiled.
 *
 * Enumerated from the module's own exports rather than from a list somebody
 * maintains, because the next one to go wrong is by definition the one nobody
 * remembered to add.
 */

/** Placeholder arguments — every builder here takes strings, and one is enough. */
function callWithPlaceholders(fn: (...args: string[]) => unknown, name: string): unknown {
  const args = Array.from({ length: fn.length }, (_, i) => `${name}-arg${i}`);
  return fn(...args);
}

function isAccountRef(value: unknown): value is AccountRef {
  return typeof value === 'object' && value !== null && 'ownerType' in value && 'kind' in value;
}

/**
 * The module seen as "name → callable", which is what a sweep over its exports
 * needs. Every export in `accounts.ts` is a builder taking strings; the cast
 * says so once instead of at every call.
 */
const MODULE = accounts as unknown as Record<string, (...args: string[]) => unknown>;

describe('account constructors', () => {
  const builders = Object.entries(MODULE).filter(([, fn]) => typeof fn === 'function');

  it('exports builders at all — a silent empty sweep would prove nothing', () => {
    expect(builders.length).toBeGreaterThan(10);
  });

  it.each(builders)('%s does not build a lock account without a purpose', (name, fn) => {
    const built = callWithPlaceholders(fn, name);
    if (!isAccountRef(built)) return;
    if (!LOCK_KINDS.has(built.kind)) return;

    // A lock account with no purpose is refused by `assertPurposedLocks` on
    // every post. A builder that can only produce one is dead code that looks
    // alive at the call site.
    expect(built.purpose, `${name} returns kind '${built.kind}' with no purpose`).toBeTruthy();
  });

  it('covers at least one lock kind — otherwise the check above is vacuous', () => {
    const lockKinds = builders
      .map(([name, fn]) => callWithPlaceholders(fn, name))
      .filter(isAccountRef)
      .map((ref) => ref.kind)
      .filter((kind) => LOCK_KINDS.has(kind));

    expect(new Set(lockKinds)).toEqual(new Set(['hold', 'escrow', 'stake', 'collateral']));
  });
});
