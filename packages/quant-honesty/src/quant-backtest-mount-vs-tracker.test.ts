import { describe, expect, it } from 'vitest';
import {
  QUANT_BACKTEST_HONEST_GAPS,
  QUANT_BACKTEST_TRACKER_ID,
  quantBacktestMountVsTrackerBoardCard,
  quantBacktestTrackerBackendDoneBarMet,
} from './quant-backtest-mount-vs-tracker.js';

describe('quant.backtest mount vs tracker (D-S-18 contract boundary)', () => {
  it('data-lake + studio deps met; refusal contract shipped; engine gaps remain', () => {
    expect(QUANT_BACKTEST_TRACKER_ID).toBe('quant.backtest');
    expect(quantBacktestTrackerBackendDoneBarMet()).toBe(true);
    expect(quantBacktestMountVsTrackerBoardCard().dataLakeDependencyMet).toBe(true);
    expect(quantBacktestMountVsTrackerBoardCard().studioDependencyMet).toBe(true);
    expect(QUANT_BACKTEST_HONEST_GAPS).toEqual(['gap.monte_carlo']);
    expect(QUANT_BACKTEST_HONEST_GAPS).not.toContain('gap.no_event_level_engine');
  });
});
