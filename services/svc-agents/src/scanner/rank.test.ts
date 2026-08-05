import { describe, expect, it } from 'vitest';
import { rankFixtures, type MarketFixture } from './rank.js';

const NOW = new Date('2026-08-04T12:00:00.000Z');

function row(partial: Partial<MarketFixture> & Pick<MarketFixture, 'marketId'>): MarketFixture {
  return {
    last: '100.5',
    volume24h: '1000',
    change24hBps: 50,
    asOf: '2026-08-04T11:59:00.000Z',
    maxAgeMs: 120_000,
    ...partial,
  };
}

describe('scanner rankFixtures (Stage-1 fixtures)', () => {
  it('returns empty when the fixture list is empty — no invented markets', () => {
    const r = rankFixtures([], { now: NOW });
    expect(r).toEqual({ status: 'empty', userMessageKey: 'agents.scanner.empty' });
  });

  it('ranks complete fresh fixtures by |change| × volume weight', () => {
    const r = rankFixtures(
      [
        row({ marketId: 'BTC-USD', change24hBps: 10, volume24h: '100' }),
        row({ marketId: 'ETH-USD', change24hBps: -200, volume24h: '5000' }),
        row({ marketId: 'SOL-USD', change24hBps: 50, volume24h: '200' }),
      ],
      { now: NOW },
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.signals.map((s) => s.marketId)).toEqual(['ETH-USD', 'SOL-USD', 'BTC-USD']);
    expect(r.signals[0]!.reasons).toContain('change_down');
    expect(r.signals[0]!.score).toMatch(/^\d+\.\d{6}$/);
  });

  it('skips incomplete quotes — never zero-fills last/volume', () => {
    const r = rankFixtures(
      [row({ marketId: 'BTC-USD' }), row({ marketId: 'GHOST-USD', last: null, volume24h: null, change24hBps: null })],
      { now: NOW },
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0]!.marketId).toBe('BTC-USD');
    expect(r.skippedIncomplete).toBe(1);
  });

  it('refuses with unavailable/stale when every row is past maxAge', () => {
    const r = rankFixtures(
      [
        row({
          marketId: 'BTC-USD',
          asOf: '2026-08-04T10:00:00.000Z',
          maxAgeMs: 60_000,
        }),
      ],
      { now: NOW },
    );
    expect(r).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.scanner.unavailable',
      reason: 'stale',
    });
  });

  it('refuses with unavailable/no_quotes when all rows lack quotes', () => {
    const r = rankFixtures([row({ marketId: 'A', last: null }), row({ marketId: 'B', volume24h: null })], { now: NOW });
    expect(r.status).toBe('unavailable');
    if (r.status !== 'unavailable') return;
    expect(r.reason).toBe('no_quotes');
    expect(r.userMessageKey).toBe('agents.scanner.unavailable');
  });

  it('does not invent a signal list when only invalid decimals arrive', () => {
    const r = rankFixtures([row({ marketId: 'X', last: 'not-a-number', volume24h: '1e999' })], { now: NOW });
    expect(r.status).toBe('unavailable');
  });

  it('Stage-2: market plane dark → refuse invent signals', () => {
    const r = rankFixtures([row({ marketId: 'BTC-USD' })], { now: NOW, marketPlane: 'dark' });
    expect(r).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.scanner.unavailable',
      reason: 'market_plane_dark',
    });
  });

  it('Stage-2 L3: market allowlist drops out-of-scope ids — no invent ranks', () => {
    const r = rankFixtures(
      [
        row({ marketId: 'BTC-USD', change24hBps: 10 }),
        row({ marketId: 'ETH-USD', change24hBps: 200 }),
        row({ marketId: 'SOL-USD', change24hBps: 50 }),
      ],
      { now: NOW, marketAllowlist: ['ETH-USD'] },
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.signals.map((s) => s.marketId)).toEqual(['ETH-USD']);
    expect(r.skippedIncomplete).toBe(2);
  });

  it('Stage-2 L3: allowlist with no matches → empty not invent', () => {
    const r = rankFixtures([row({ marketId: 'BTC-USD' })], { now: NOW, marketAllowlist: ['NOPE-USD'] });
    expect(r).toEqual({ status: 'empty', userMessageKey: 'agents.scanner.empty' });
  });
});
