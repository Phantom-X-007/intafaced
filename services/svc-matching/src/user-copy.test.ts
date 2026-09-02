import { describe, expect, it } from 'vitest';
import { userCopy } from './user-copy.js';

/**
 * Unit card — user-visible matching copy resolves @intafaced/i18n keys
 * 1. Promise: TRK-infra.i18n slice — operator/public refuse strings on the inject door
 * 2. Break: unknown key invents English instead of echoing the dotted name
 * 3. Done bar: known key renders catalog copy; unknown key === key string
 * 4. Class N
 * 5. Paths: services/svc-matching + packages/i18n consumer pin (do not edit catalog)
 * 6. RED: unknown key becomes a sentence
 * 7. Collision: none vs svc-ledger / packages/i18n catalog
 */
describe('userCopy — catalog keys, never invented English', () => {
  it('resolves a known catalog key from @intafaced/i18n', () => {
    expect(userCopy('error.notFound')).toBe('We could not find that.');
    expect(userCopy('matching.order_not_found')).toBe('We could not find that.');
    expect(userCopy('matching.market_not_found')).toBe('We could not find that.');
    expect(userCopy('matching.unauthenticated')).toBe('Sign in to continue.');
    expect(userCopy('error.unauthorized')).toBe('Sign in to continue.');
    expect(userCopy('error.generic')).toBe('Something went wrong. Try again.');
    expect(userCopy('error.forbidden')).toBe('You do not have access to this.');
  });

  it('renders the dotted key when the key is not in the catalog', () => {
    const missing = 'matching.refuse.this.key.does.not.exist';
    const rendered = userCopy(missing);

    expect(rendered).toBe(missing);
    expect(rendered).not.toMatch(/ /);
    expect(rendered).not.toMatch(/please try|something went wrong|could not find|not live|not a market/i);
  });

  it('does not invent engine refuse copy for unkeyed matching codes', () => {
    const postOnly = userCopy('matching.post_only_would_cross');
    expect(postOnly).toBe('matching.post_only_would_cross');
    expect(postOnly).not.toMatch(/ /);
    expect(postOnly).not.toMatch(/would cross|post-only|rejected/i);

    const disabled = userCopy('matching.engine_flag_off');
    expect(disabled).toBe('matching.engine_flag_off');
    expect(disabled).not.toMatch(/ /);
    expect(disabled).not.toMatch(/flag is off|disabled|not ready/i);

    const unpublished = userCopy('matching.rulebook_unpublished');
    expect(unpublished).toBe('matching.rulebook_unpublished');
    expect(unpublished).not.toMatch(/ /);
    expect(unpublished).not.toMatch(/best execution|certified venue|not published/i);
  });
});
