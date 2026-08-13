import { describe, expect, it } from 'vitest';
import type { TickerFixture } from './data-tools.js';
import { SCANNER_DATA_TOOLS } from './guardrail.js';
import { rankLiveFromTickers } from './rank-live.js';
import { SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL, SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW } from './signal-inputs-law.js';

const NOW = new Date('2026-08-07T12:00:00.000Z');

const law = {
  published: true as const,
  matrix: {
    free: { maxSignals: 2, tools: [...SCANNER_DATA_TOOLS] },
  },
};

function ticker(partial: Partial<TickerFixture> & Pick<TickerFixture, 'marketId'>): TickerFixture {
  return {
    last: '100.5',
    volume24h: '1000',
    change24hBps: 50,
    asOf: '2026-08-07T11:59:00.000Z',
    maxAgeMs: 120_000,
    ...partial,
  };
}

describe('rankLiveFromTickers (Stage-2)', () => {
  it('D26-P1-A3: blank P0-11 refuses before tier / dark checks', () => {
    const r = rankLiveFromTickers({
      plane: 'live',
      tierLaw: law,
      userTier: 'free',
      now: NOW,
      tickers: [ticker({ marketId: 'BTC-USD' })],
    });
    expect(r).toEqual({
      status: 'refuse',
      reason: 'signal_inputs_law_blank',
      userMessageKey: 'agents.scanner.tier_closed',
      residual: SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
    });
  });

  it('ranks accepted tickers and caps by tier maxSignals', () => {
    const r = rankLiveFromTickers({
      plane: 'live',
      tierLaw: law,
      signalInputsLaw: SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW,
      userTier: 'free',
      now: NOW,
      tickers: [
        ticker({ marketId: 'BTC-USD', change24hBps: 10, volume24h: '100' }),
        ticker({ marketId: 'ETH-USD', change24hBps: -200, volume24h: '5000' }),
        ticker({ marketId: 'SOL-USD', change24hBps: 50, volume24h: '200' }),
      ],
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.maxSignals).toBe(2);
    expect(r.userTier).toBe('free');
    expect(r.tickersAccepted).toBe(3);
    expect(r.signals).toHaveLength(2);
    expect(r.signals.map((s) => s.marketId)).toEqual(['ETH-USD', 'SOL-USD']);
  });

  it('dark plane refuses invent', () => {
    const r = rankLiveFromTickers({
      plane: 'dark',
      tierLaw: law,
      signalInputsLaw: SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW,
      userTier: 'free',
      now: NOW,
      tickers: [ticker({ marketId: 'BTC-USD' })],
    });
    expect(r).toEqual({
      status: 'refuse',
      reason: 'market_plane_dark',
      userMessageKey: 'agents.scanner.unavailable',
    });
  });

  it('blank tier law refuse-closed', () => {
    const r = rankLiveFromTickers({
      plane: 'live',
      tierLaw: null,
      signalInputsLaw: SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW,
      userTier: 'free',
      now: NOW,
      tickers: [ticker({ marketId: 'BTC-USD' })],
    });
    expect(r).toEqual({
      status: 'refuse',
      reason: 'tier_law_blank',
      userMessageKey: 'agents.scanner.tier_closed',
    });
  });

  it('all stale/incomplete tickers → no_live_tickers refuse', () => {
    const r = rankLiveFromTickers({
      plane: 'live',
      tierLaw: law,
      signalInputsLaw: SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW,
      userTier: 'free',
      now: NOW,
      tickers: [
        ticker({ marketId: 'A', last: null }),
        ticker({
          marketId: 'B',
          asOf: '2026-08-07T10:00:00.000Z',
          maxAgeMs: 60_000,
        }),
      ],
    });
    expect(r).toEqual({
      status: 'refuse',
      reason: 'no_live_tickers',
      userMessageKey: 'agents.scanner.unavailable',
    });
  });

  it('empty ticker list → empty (never invent)', () => {
    const r = rankLiveFromTickers({
      plane: 'live',
      tierLaw: law,
      signalInputsLaw: SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW,
      userTier: 'free',
      now: NOW,
      tickers: [],
    });
    expect(r).toEqual({ status: 'empty', userMessageKey: 'agents.scanner.empty' });
  });
});
