import { describe, expect, it } from 'vitest';
import {
  agentsPortfolioMountVsTrackerBoardCard,
  agentsPortfolioTrackerBackendDoneBarMet,
  PORTFOLIO_AGENT_TRACKER_ID,
  PORTFOLIO_MOUNTED_DOORS,
  portfolioDoorsInRouterSource,
} from './mount-vs-tracker.js';

describe('agents.portfolio mount vs tracker honest gaps (D26-P1-PF1)', () => {
  it('backend done bar met on tip — plan door mounted, execution out of slice', () => {
    expect(PORTFOLIO_AGENT_TRACKER_ID).toBe('agents.portfolio');
    expect(portfolioDoorsInRouterSource()).toEqual([...PORTFOLIO_MOUNTED_DOORS]);
    expect(agentsPortfolioTrackerBackendDoneBarMet()).toBe(true);
    expect(agentsPortfolioMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
