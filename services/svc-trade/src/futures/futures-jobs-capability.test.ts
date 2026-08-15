/**
 * Unit card — futures jobs capability note
 * 1. Promise: bots see listed ≠ orderable; jobs default OFF; next funding unpublished; D3 unset
 * 2. Break: omitted orderableEnabled/jobsEnabled reads as live
 * 3. Done bar: both defaults false; flags only when explicitly true; unpublished/d3 literals
 * 4. Class N
 * 5. Paths: svc-trade/src/futures
 * 6. RED: {} → orderableEnabled false, jobsEnabled false
 * 7. Collision: none — live host wire is futures-jobs-env-passthrough.test.ts
 */

import { describe, expect, it } from 'vitest';
import { presentFuturesJobsCapabilityNote } from './futures-jobs-capability.js';

describe('presentFuturesJobsCapabilityNote', () => {
  it('omitted flags match shipped env defaults — orderable off, jobs off', () => {
    const n = presentFuturesJobsCapabilityNote({});
    expect(n.orderableEnabled).toBe(false);
    expect(n.orderableDefault).toBe(false);
    expect(n.jobsEnabled).toBe(false);
    expect(n.jobsDefault).toBe(false);
    expect(n.nextFundingTimestamp).toBe('unpublished');
    expect(n.indexPrice).toBe('unpublished');
    expect(n.ladderNumbers).toBe('d3_unset');
    expect(n.profitSourceConfigured).toBe(false);
    expect(n.profitSourceDefault).toBe(false);
    expect(n.insuranceEmptyBlocksLiveList).toBe(true);
    expect(n.insuranceTargetSize).toBe('owner_unset');
    expect(n.fundingMaxAbsRateConfigured).toBe(false);
    expect(n.fundingMaxAbsRateDefault).toBe(false);
    expect(n.fundingMarketCount).toBe(0);
    expect(n.venueMarkConfigured).toBe(false);
    expect(n.venueMarkDefault).toBe(false);
  });

  it('live flags are only true when the caller says true', () => {
    expect(presentFuturesJobsCapabilityNote({ jobsEnabled: true }).jobsEnabled).toBe(true);
    expect(presentFuturesJobsCapabilityNote({ orderableEnabled: true }).orderableEnabled).toBe(true);
    expect(presentFuturesJobsCapabilityNote({ profitSourceConfigured: true }).profitSourceConfigured).toBe(true);
    expect(presentFuturesJobsCapabilityNote({ fundingMaxAbsRateConfigured: true }).fundingMaxAbsRateConfigured).toBe(true);
    expect(presentFuturesJobsCapabilityNote({ jobsEnabled: false, orderableEnabled: false }).jobsEnabled).toBe(false);
    expect(presentFuturesJobsCapabilityNote({ fundingMarketCount: 2 }).fundingMarketCount).toBe(2);
    expect(presentFuturesJobsCapabilityNote({ fundingMarketCount: -1 }).fundingMarketCount).toBe(0);
    expect(presentFuturesJobsCapabilityNote({ fundingMarketCount: 2 })).not.toHaveProperty('fundingMarketIds');
    expect(presentFuturesJobsCapabilityNote({ venueMarkConfigured: true }).venueMarkConfigured).toBe(true);
    expect(presentFuturesJobsCapabilityNote({ venueMarkConfigured: true })).not.toHaveProperty('venueId');
    expect(presentFuturesJobsCapabilityNote({ venueMarkConfigured: true })).not.toHaveProperty('symbols');
  });
});
