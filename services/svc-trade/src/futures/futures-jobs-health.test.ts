/**
 * Unit card — futures jobs occupancy on /health
 * 1. Promise: /health shows kill-switch + funding count, never invents ids/rates
 * 2. Break: enabled+empty markets reads as a live funding schedule
 * 3. Done bar: jobs_off / liq_only / funding_scheduled; ceiling is a boolean
 * 4. Class N
 * 5. Paths: svc-trade/src/futures/futures-jobs-health.ts
 * 6. RED: enabled+0 markets → fundingScheduled false, reason liq_only
 * 7. Collision: #1878 compose pin
 */

import { describe, expect, it } from 'vitest';
import { presentFuturesJobsHealth } from './futures-jobs-health.js';

describe('presentFuturesJobsHealth', () => {
  it('default off is jobs_off, not a live scheduler', () => {
    const h = presentFuturesJobsHealth({
      enabled: false,
      fundingMarketCount: 0,
      fundingMaxAbsRateConfigured: false,
    });
    expect(h.enabled).toBe(false);
    expect(h.jobsDefault).toBe(false);
    expect(h.liquidationArmed).toBe(false);
    expect(h.fundingScheduled).toBe(false);
    expect(h.reason).toBe('jobs_off');
    expect(h.fundingMaxAbsRateDefault).toBe(false);
  });

  it('enabled with no named markets is liquidation only', () => {
    const h = presentFuturesJobsHealth({
      enabled: true,
      fundingMarketCount: 0,
      fundingMaxAbsRateConfigured: true,
    });
    expect(h.enabled).toBe(true);
    expect(h.liquidationArmed).toBe(true);
    expect(h.fundingScheduled).toBe(false);
    expect(h.reason).toBe('liq_only');
    expect(h.fundingMaxAbsRateConfigured).toBe(true);
  });

  it('enabled with named markets advertises funding ticks without echoing ids', () => {
    const h = presentFuturesJobsHealth({
      enabled: true,
      fundingMarketCount: 2,
      fundingMaxAbsRateConfigured: false,
    });
    expect(h.fundingScheduled).toBe(true);
    expect(h.fundingMarketCount).toBe(2);
    expect(h.reason).toBe('funding_scheduled');
    expect(h.fundingMaxAbsRateConfigured).toBe(false);
    expect(h).not.toHaveProperty('fundingMarketIds');
    expect(h).not.toHaveProperty('fundingMaxAbsRate');
  });

  it('NaN / negative counts do not invent a market list', () => {
    expect(
      presentFuturesJobsHealth({
        enabled: true,
        fundingMarketCount: Number.NaN,
        fundingMaxAbsRateConfigured: false,
      }).fundingScheduled,
    ).toBe(false);
    expect(
      presentFuturesJobsHealth({
        enabled: true,
        fundingMarketCount: -1,
        fundingMaxAbsRateConfigured: false,
      }).fundingMarketCount,
    ).toBe(0);
  });
});
