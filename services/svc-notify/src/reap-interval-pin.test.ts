/**
 * Unit card — reaper interval is one minute (product observability law)
 * 1. Promise: README reaper every minute so stuck margin rows don't sit forever
 * 2. Break: interval silently becomes hours
 * 3. Done bar: DELIVERY_REAP_INTERVAL_MS === 60_000
 * 4. Class N
 */

import { describe, expect, it } from 'vitest';
import { DELIVERY_REAP_INTERVAL_MS } from './channel-store.js';

describe('delivery reaper interval pin', () => {
  it('runs every minute so abandoned truth is operator-visible', () => {
    expect(DELIVERY_REAP_INTERVAL_MS).toBe(60_000);
  });
});
