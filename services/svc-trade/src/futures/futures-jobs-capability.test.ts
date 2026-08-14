/**
 * Unit card — futures jobs capability note
 * 1. Promise: bots can see funding/liq jobs default OFF
 * 2. Break: omitted jobsEnabled reads as live ticks
 * 3. Done bar: jobsDefault false; jobsEnabled only when explicitly true
 * 4. Class N
 * 5. Paths: svc-trade/src/futures
 * 6. RED: {} → jobsEnabled false
 * 7. Collision: none — live host wire is futures-jobs-env-passthrough.test.ts
 */

import { describe, expect, it } from 'vitest';
import { presentFuturesJobsCapabilityNote } from './futures-jobs-capability.js';

describe('presentFuturesJobsCapabilityNote', () => {
  it('omitted flag matches shipped env default — jobs off', () => {
    const n = presentFuturesJobsCapabilityNote({});
    expect(n.jobsEnabled).toBe(false);
    expect(n.jobsDefault).toBe(false);
  });

  it('jobsEnabled is only true when the caller says true', () => {
    expect(presentFuturesJobsCapabilityNote({ jobsEnabled: true }).jobsEnabled).toBe(true);
    expect(presentFuturesJobsCapabilityNote({ jobsEnabled: false }).jobsEnabled).toBe(false);
  });
});
