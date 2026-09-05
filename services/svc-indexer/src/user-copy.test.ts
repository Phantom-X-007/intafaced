import { describe, expect, it } from 'vitest';
import { userCopy } from './user-copy.js';

/**
 * Unit card — user-visible indexer copy resolves @intafaced/i18n keys
 * 1. Promise: TRK-infra.i18n slice — public/read-model refuse + halt door strings
 * 2. Break: unknown key invents English instead of echoing the dotted name
 * 3. Done bar: known key renders catalog copy; unknown key === key string
 * 4. Class N
 * 5. Paths: services/svc-indexer + packages/i18n consumer pin (do not edit catalog)
 * 6. RED: unknown key becomes a sentence
 * 7. Collision: none vs svc-support / packages/i18n catalog
 */
describe('userCopy — catalog keys, never invented English', () => {
  it('resolves a known catalog key from @intafaced/i18n', () => {
    expect(userCopy('error.generic')).toBe('Something went wrong. Try again.');
    expect(userCopy('indexer.request_failed')).toBe('Something went wrong. Try again.');
    expect(userCopy('error.network')).toBe('No connection. Check your network.');
    expect(userCopy('error.notFound')).toBe('We could not find that.');
    expect(userCopy('error.forbidden')).toBe('You do not have access to this.');
  });

  it('renders the dotted key when the key is not in the catalog', () => {
    const missing = 'indexer.refuse.this.key.does.not.exist';
    const rendered = userCopy(missing);

    expect(rendered).toBe(missing);
    expect(rendered).not.toMatch(/ /);
    expect(rendered).not.toMatch(/please try|something went wrong|could not find|live book|silent zero/i);
  });

  it('does not invent copy for unkeyed indexer refuse / halt codes', () => {
    const unconfigured = userCopy('indexer.chain_not_configured');
    expect(unconfigured).toBe('indexer.chain_not_configured');
    expect(unconfigured).not.toMatch(/ /);
    expect(unconfigured).not.toMatch(/will not serve|absent, never zero|no chain is wired/i);

    const unreachable = userCopy('indexer.chain_unreachable');
    expect(unreachable).toBe('indexer.chain_unreachable');
    expect(unreachable).not.toMatch(/ /);
    expect(unreachable).not.toMatch(/no connection|check your network|will not serve/i);

    const halted = userCopy('indexer.halted');
    expect(halted).toBe('indexer.halted');
    expect(halted).not.toMatch(/ /);
    expect(halted).not.toMatch(/projection is known wrong|will not serve data|re-indexed/i);

    const mismatch = userCopy('indexer.chain_id_mismatch');
    expect(mismatch).toBe('indexer.chain_id_mismatch');
    expect(mismatch).not.toMatch(/ /);

    expect(userCopy('indexer.book_depth_unset')).toBe('indexer.book_depth_unset');
    expect(userCopy('indexer.fills_limit_unset')).toBe('indexer.fills_limit_unset');
    expect(userCopy('indexer.stream_depth_unset')).toBe('indexer.stream_depth_unset');
  });
});
