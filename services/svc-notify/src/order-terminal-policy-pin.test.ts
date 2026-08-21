/**
 * Unit card — order terminal notify policy pin
 * 1. Promise: README `trade.order.updated` — cancelled/rejected/expired only
 * 2. Break: casual widen to pending/open/filled (fills already have fillSettled)
 * 3. Done bar: default statuses === those three; severity info
 * 4. Class N
 * 5. Paths: svc-notify
 * 6. RED: pin asserts conservative default
 * 7. Collision: none vs #1827/#1828 (notify only)
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_ORDER_TERMINAL_NOTIFY_POLICY } from './events.js';

describe('order terminal notify policy — conservative default is the product law', () => {
  it('notifies cancelled/rejected/expired only — not pending/open/filled', () => {
    expect(DEFAULT_ORDER_TERMINAL_NOTIFY_POLICY.statuses).toEqual(['cancelled', 'rejected', 'expired']);
  });

  it('uses info so mute may apply (not a money-safety fan-out)', () => {
    expect(DEFAULT_ORDER_TERMINAL_NOTIFY_POLICY.severity).toBe('info');
  });
});
