/**
 * Unit card — position notify policy pin
 * 1. Promise: README `trade.position.updated` — liquidated only (events.ts DEFAULT)
 * 2. Break: casual widen to open/close without product law
 * 3. Done bar: default statuses === ['liquidated']; severity critical
 * 4. Class N
 * 5. Paths: svc-notify
 * 6. RED: pin asserts conservative default
 * 7. Collision: none
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_POSITION_NOTIFY_POLICY } from './events.js';

describe('position notify policy — conservative default is the product law', () => {
  it('notifies liquidated only — not every open/close', () => {
    expect(DEFAULT_POSITION_NOTIFY_POLICY.statuses).toEqual(['liquidated']);
  });

  it('uses critical so mute cannot silence a liquidation', () => {
    expect(DEFAULT_POSITION_NOTIFY_POLICY.severity).toBe('critical');
  });
});
