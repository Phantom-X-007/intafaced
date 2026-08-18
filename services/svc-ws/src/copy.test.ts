import { describe, expect, it } from 'vitest';
import { resolveWsCopy, WS_COPY } from './copy.js';

describe('resolveWsCopy — catalog keys, never invented English', () => {
  it('returns a key that is not in the catalog as the key itself', () => {
    const key = 'ws.close.surface.that.was.never.keyed';
    expect(resolveWsCopy(key)).toBe(key);
  });

  it('does not invent English for an unknown close key', () => {
    const key = 'ws.close.surface.that.was.never.keyed';
    const rendered = resolveWsCopy(key);
    expect(rendered).not.toMatch(/something went wrong/i);
    expect(rendered).not.toMatch(/unknown market/i);
    expect(rendered).not.toMatch(/try again/i);
    expect(rendered).not.toContain(' ');
  });

  it('resolves a key that already exists on tip', () => {
    expect(resolveWsCopy('error.generic')).toBe('Something went wrong. Try again.');
  });

  it('unknown-market close copy is the refuse-form key until a catalog row lands', () => {
    expect(resolveWsCopy(WS_COPY.unknownMarket)).toBe(WS_COPY.unknownMarket);
  });
});
