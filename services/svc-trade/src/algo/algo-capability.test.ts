/**
 * Unit card — algo capability note
 * 1. Promise: bots can see create vs jobs OFF; icebergs out
 * 2. Break: omitted jobsEnabled reads as live scheduler
 * 3. Done bar: jobsDefault false; jobsEnabled only when explicitly true
 * 4. Class N
 * 5. Paths: svc-trade/src/algo
 * 6. RED: {} → jobsEnabled false
 * 7. Collision: no index.ts (open #1831)
 */

import { describe, expect, it } from 'vitest';
import { presentAlgoCapabilityNote } from './algo-capability.js';

describe('presentAlgoCapabilityNote', () => {
  it('omitted flags match shipped env defaults — create on, jobs off', () => {
    const n = presentAlgoCapabilityNote({});
    expect(n.createEnabled).toBe(true);
    expect(n.jobsEnabled).toBe(false);
    expect(n.jobsDefault).toBe(false);
    expect(n.icebergs).toBe('out');
  });

  it('jobsEnabled is only true when the caller says true', () => {
    expect(presentAlgoCapabilityNote({ jobsEnabled: true }).jobsEnabled).toBe(true);
    expect(presentAlgoCapabilityNote({ jobsEnabled: false }).jobsEnabled).toBe(false);
  });

  it('createEnabled false is reported — kill-switch is not hidden', () => {
    expect(presentAlgoCapabilityNote({ createEnabled: false }).createEnabled).toBe(false);
  });
});
