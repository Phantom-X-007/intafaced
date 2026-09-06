/**
 * Leftover clients after #4184 searchKb / #4185 GET /tickers mills:
 * omit limit must refuse named — never invent 100/500.
 */
import { describe, expect, it } from 'vitest';
import { AgentError, assertKbSearchPageLimit, assertTickersPageLimit } from './errors.js';

describe('assertKbSearchPageLimit', () => {
  it('refuses omit / null / 0 / negative / garbage — never invent 100', () => {
    for (const bad of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, '8', { n: 2 }] as const) {
      expect(() => assertKbSearchPageLimit(bad)).toThrow(AgentError);
    }
    try {
      assertKbSearchPageLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(AgentError);
      expect((e as AgentError).code).toBe('agents.kb_search_limit_unset');
      expect((e as AgentError).userMessageKey).toBe('agents.refused.kb_search_limit_unset');
      expect((e as AgentError).message).not.toMatch(/default 100/i);
    }
  });

  it('accepts owner-published 2 and 500 slices', () => {
    expect(assertKbSearchPageLimit(2)).toBe(2);
    expect(assertKbSearchPageLimit(500)).toBe(500);
  });
});

describe('assertTickersPageLimit', () => {
  it('refuses omit / null / 0 / negative / garbage — never invent 500', () => {
    for (const bad of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, '8'] as const) {
      expect(() => assertTickersPageLimit(bad)).toThrow(AgentError);
    }
    try {
      assertTickersPageLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(AgentError);
      expect((e as AgentError).code).toBe('agents.tickers_limit_unset');
      expect((e as AgentError).userMessageKey).toBe('agents.scanner.tickers_limit_unset');
      expect((e as AgentError).message).not.toMatch(/default 500/i);
    }
  });

  it('accepts owner-published 50 and 500 slices', () => {
    expect(assertTickersPageLimit(50)).toBe(50);
    expect(assertTickersPageLimit(500)).toBe(500);
  });
});
