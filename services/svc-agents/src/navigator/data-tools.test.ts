import { describe, expect, it } from 'vitest';
import { invokeNavigatorDataTool, isNavigatorDataToolOk, NAVIGATOR_DATA_TOOLS } from './data-tools.js';

const publishedAll = {
  published: true as const,
  matrix: {
    free: [...NAVIGATOR_DATA_TOOLS],
  },
};

const now = new Date('2026-08-07T12:00:00.000Z');

describe('navigator Stage-2 data tools', () => {
  it('refuses money-write tools without inventing a post', () => {
    const r = invokeNavigatorDataTool({
      tool: 'ledger.post',
      plane: 'live',
      tierLaw: publishedAll,
      userTier: 'free',
    });
    expect(r).toEqual({
      status: 'refuse',
      tool: 'ledger.post',
      reason: 'money_write',
      userMessageKey: 'agents.navigator.unavailable',
    });
  });

  it('dark plane refuses invent quotes', () => {
    const r = invokeNavigatorDataTool({
      tool: 'trade.quote',
      plane: 'dark',
      tierLaw: publishedAll,
      userTier: 'free',
      quote: { marketId: 'm1', last: '1.23', asOf: '2026-08-07T11:59:00.000Z', maxAgeMs: 60_000 },
      now,
    });
    expect(r).toMatchObject({ status: 'refuse', reason: 'trade_plane_dark' });
  });

  it('blank tier law refuse-closed before fixture use', () => {
    const r = invokeNavigatorDataTool({
      tool: 'trade.quote',
      plane: 'live',
      tierLaw: null,
      userTier: 'free',
      quote: { marketId: 'm1', last: '1.23', asOf: '2026-08-07T11:59:00.000Z', maxAgeMs: 60_000 },
      now,
    });
    expect(r).toMatchObject({ status: 'refuse', reason: 'tier_law_blank' });
  });

  it('echoes trade.quote fixture last — never invents mid', () => {
    const r = invokeNavigatorDataTool({
      tool: 'trade.quote',
      plane: 'live',
      tierLaw: publishedAll,
      userTier: 'free',
      quote: { marketId: 'btc-usd', last: '64000.50', asOf: '2026-08-07T11:59:30.000Z', maxAgeMs: 120_000 },
      now,
    });
    expect(r).toEqual({
      status: 'ok',
      tool: 'trade.quote',
      marketId: 'btc-usd',
      last: '64000.50',
      asOf: '2026-08-07T11:59:30.000Z',
    });
    expect(isNavigatorDataToolOk(r)).toBe(true);
  });

  it('null last → incomplete_quote (no zero-fill)', () => {
    const r = invokeNavigatorDataTool({
      tool: 'trade.quote',
      plane: 'live',
      tierLaw: publishedAll,
      userTier: 'free',
      quote: { marketId: 'm1', last: null, asOf: '2026-08-07T11:59:00.000Z', maxAgeMs: 60_000 },
      now,
    });
    expect(r).toMatchObject({ status: 'refuse', reason: 'incomplete_quote' });
  });

  it('stale quote refuses', () => {
    const r = invokeNavigatorDataTool({
      tool: 'trade.quote',
      plane: 'live',
      tierLaw: publishedAll,
      userTier: 'free',
      quote: { marketId: 'm1', last: '1.00', asOf: '2026-08-07T10:00:00.000Z', maxAgeMs: 60_000 },
      now,
    });
    expect(r).toMatchObject({ status: 'refuse', reason: 'stale' });
  });

  it('lists markets from fixtures only', () => {
    const r = invokeNavigatorDataTool({
      tool: 'trade.markets.list',
      plane: 'live',
      tierLaw: publishedAll,
      userTier: 'free',
      markets: [{ marketId: 'm1', symbol: 'BTC-USD', status: 'open' }],
    });
    expect(r).toEqual({
      status: 'ok',
      tool: 'trade.markets.list',
      markets: [{ marketId: 'm1', symbol: 'BTC-USD', status: 'open' }],
    });
  });

  it('empty markets refuse', () => {
    expect(
      invokeNavigatorDataTool({
        tool: 'trade.markets.list',
        plane: 'live',
        tierLaw: publishedAll,
        userTier: 'free',
        markets: [],
      }),
    ).toMatchObject({ status: 'refuse', reason: 'empty_markets' });
  });

  it('reads identity session fixture', () => {
    const r = invokeNavigatorDataTool({
      tool: 'identity.session.read',
      plane: 'live',
      tierLaw: publishedAll,
      userTier: 'free',
      session: { sessionId: 's1', userId: 'u1', status: 'open' },
    });
    expect(r).toEqual({
      status: 'ok',
      tool: 'identity.session.read',
      session: { sessionId: 's1', userId: 'u1', status: 'open' },
    });
  });

  it('tool outside published tier grants refuses', () => {
    const r = invokeNavigatorDataTool({
      tool: 'trade.quote',
      plane: 'live',
      tierLaw: { published: true, matrix: { free: ['trade.markets.list'] } },
      userTier: 'free',
      quote: { marketId: 'm1', last: '1', asOf: '2026-08-07T11:59:00.000Z', maxAgeMs: 60_000 },
      now,
    });
    expect(r).toMatchObject({ status: 'refuse', reason: 'tool_not_in_tier' });
  });
});
