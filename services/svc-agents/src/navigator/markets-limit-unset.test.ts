/**
 * Leftover navigator client after trade milled GET /api/v1/markets:
 * omit limit must refuse named — never invent 50.
 */
import { describe, expect, it } from 'vitest';
import { AgentError, assertNavigatorMarketsPageLimit } from '../errors.js';
import { readLiveNavigatorMarkets, type NavigatorTradeDataPort } from './trade-data-port.js';

describe('assertNavigatorMarketsPageLimit', () => {
  it('refuses omit / null / 0 / negative / garbage — never invent 50', () => {
    for (const bad of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, '8', { n: 2 }] as const) {
      expect(() => assertNavigatorMarketsPageLimit(bad)).toThrow(AgentError);
    }
    try {
      assertNavigatorMarketsPageLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(AgentError);
      expect((e as AgentError).code).toBe('agents.navigator_markets_limit_unset');
      expect((e as AgentError).userMessageKey).toBe('agents.navigator.markets_limit_unset');
      expect((e as AgentError).message).not.toMatch(/default 50/i);
    }
  });

  it('accepts owner-published 50 and 500 slices', () => {
    expect(assertNavigatorMarketsPageLimit(50)).toBe(50);
    expect(assertNavigatorMarketsPageLimit(500)).toBe(500);
  });
});

describe('readLiveNavigatorMarkets', () => {
  it('markets_limit_unset from the HTTP client stays named — not no_live_markets', async () => {
    const port: NavigatorTradeDataPort = {
      listMarkets: async () => {
        throw new AgentError(
          'Navigator markets page limit is unset — pass limit (never invent 50)',
          'agents.navigator_markets_limit_unset',
          'agents.navigator.markets_limit_unset',
        );
      },
      quote: async () => null,
    };
    expect(await readLiveNavigatorMarkets(port)).toEqual({ ok: false, reason: 'markets_limit_unset' });
  });

  it('throwing sample is no_live_markets — never invented listings', async () => {
    const port: NavigatorTradeDataPort = {
      listMarkets: async () => {
        throw new Error('trade unreachable');
      },
      quote: async () => null,
    };
    expect(await readLiveNavigatorMarkets(port, 50)).toEqual({ ok: false, reason: 'no_live_markets' });
  });

  it('empty list is no_live_markets', async () => {
    const port: NavigatorTradeDataPort = {
      listMarkets: async () => [],
      quote: async () => null,
    };
    expect(await readLiveNavigatorMarkets(port, 50)).toEqual({ ok: false, reason: 'no_live_markets' });
  });
});
