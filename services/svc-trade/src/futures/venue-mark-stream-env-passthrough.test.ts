/**
 * Unit card — live host passes TRADE_VENUE_MARK_STREAM into /health
 * 1. Promise: venueLatency.streamEnabled follows env; default stays OFF
 * 2. Break: presentVenueLatencyHealth(adapter) with no flags hides a live stream
 * 3. Done bar: index.ts passes streamEnabled from env
 * 4. Class N
 * 5. Paths: svc-trade/src/index.ts
 * 6. RED: /health venueLatency call has no streamEnabled: env.TRADE_VENUE_MARK_STREAM
 * 7. Collision: #1866 public-rest listing — this PR only health + venue-latency-health
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(here, '..', 'index.ts'), 'utf8');

describe('venue mark stream env passthrough into /health', () => {
  it('live host passes TRADE_VENUE_MARK_STREAM into presentVenueLatencyHealth', () => {
    expect(indexSource).toMatch(/presentVenueLatencyHealth\([\s\S]*streamEnabled:\s*env\.TRADE_VENUE_MARK_STREAM/);
  });
});
