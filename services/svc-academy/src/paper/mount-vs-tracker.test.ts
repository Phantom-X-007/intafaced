import { describe, expect, it } from 'vitest';
import {
  academyPaperTradingMountVsTrackerBoardCard,
  academyPaperTradingTrackerBackendDoneBarMet,
  PAPER_PRODUCT_SYMBOLS,
  PAPER_TRADING_TRACKER_ID,
  paperSymbolsInSource,
} from './mount-vs-tracker.js';

describe('academy.paper-trading mount vs tracker honest gaps (D26-P1-PT1M)', () => {
  it('backend done bar met on tip — paper flag required, no live money path', () => {
    expect(PAPER_TRADING_TRACKER_ID).toBe('academy.paper-trading');
    expect(paperSymbolsInSource()).toEqual([...PAPER_PRODUCT_SYMBOLS]);
    expect(academyPaperTradingTrackerBackendDoneBarMet()).toBe(true);
    expect(academyPaperTradingMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
