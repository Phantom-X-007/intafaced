/**
 * Unit card — MM seed health surface
 * 1. Promise: /health shows kill-switch + named-market arm, never invents markets
 * 2. Break: enabled true with empty targets reads as live seeding
 * 3. Done bar: jobs_off / no_targets / armed; armed ≡ mmSeedJobsArmed
 * 4. Class N
 * 5. Paths: svc-trade/src/mm
 * 6. RED: enabled+0 targets → armed false, reason no_targets
 * 7. Collision: none vs #1830 svc-ws
 */

import { describe, expect, it } from 'vitest';
import { mmSeedJobsArmed } from './seed-honesty.js';
import { presentMmSeedHealth } from './seed-health.js';

describe('presentMmSeedHealth', () => {
  it('default off is jobs_off, not a live seeder', () => {
    const h = presentMmSeedHealth({ enabled: false, targetCount: 0 });
    expect(h.enabled).toBe(false);
    expect(h.armed).toBe(false);
    expect(h.reason).toBe('jobs_off');
    expect(h.targetCount).toBe(0);
    expect(h.armed).toBe(mmSeedJobsArmed(false, 0));
  });

  it('enabled with no named markets stays unarmed', () => {
    const h = presentMmSeedHealth({ enabled: true, targetCount: 0 });
    expect(h.enabled).toBe(true);
    expect(h.armed).toBe(false);
    expect(h.reason).toBe('no_targets');
  });

  it('enabled with named markets is armed — still does not start the job here', () => {
    const h = presentMmSeedHealth({ enabled: true, targetCount: 2 });
    expect(h.armed).toBe(true);
    expect(h.reason).toBe('armed');
    expect(h.targetCount).toBe(2);
    expect(h.armed).toBe(mmSeedJobsArmed(true, 2));
  });

  it('NaN / negative target counts do not invent a market list', () => {
    expect(presentMmSeedHealth({ enabled: true, targetCount: Number.NaN }).armed).toBe(false);
    expect(presentMmSeedHealth({ enabled: true, targetCount: -1 }).targetCount).toBe(0);
  });
});
