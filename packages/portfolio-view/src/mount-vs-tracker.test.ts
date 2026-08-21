import { describe, expect, it } from 'vitest';
import {
  OPS_PORTFOLIO_TRACKER_ID,
  PORTFOLIO_LEDGER_DOORS,
  opsPortfolioMountVsTrackerBoardCard,
  opsPortfolioTrackerBackendDoneBarMet,
  portfolioDoorInLedgerRouterSource,
} from './mount-vs-tracker.js';

describe('ops.portfolio mount vs tracker honest gaps (D26-P1-P2)', () => {
  it('backend done bar met on tip — ledger portfolio view mounted', () => {
    expect(OPS_PORTFOLIO_TRACKER_ID).toBe('ops.portfolio');
    expect(portfolioDoorInLedgerRouterSource()).toBe(true);
    expect(PORTFOLIO_LEDGER_DOORS).toHaveLength(1);
    expect(opsPortfolioTrackerBackendDoneBarMet()).toBe(true);
    expect(opsPortfolioMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
