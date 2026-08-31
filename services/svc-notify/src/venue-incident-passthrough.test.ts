/**
 * Unit card — live host mounts venueIncident on /health and /ready
 * 1. Promise: M18 — halt/incident is named on the probes, not swallowed by ok:true
 * 2. Break: /health stays `{ ok, service }` so ops infer allFine from liveness
 * 3. Done bar: index.ts /health and /ready both await loadVenueIncident()
 * 4. Class N
 * 5. Paths: services/svc-notify/src/index.ts
 * 6. RED pin
 * 7. Collision: none
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const indexSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8');

describe('venue incident occupancy on /health and /ready', () => {
  it('live host mounts loadVenueIncident on both probes', () => {
    expect(indexSource).toMatch(/app\.get\('\/health'[\s\S]*venueIncident:\s*await loadVenueIncident\(\)/);
    expect(indexSource).toMatch(/app\.get\('\/ready'[\s\S]*venueIncident:\s*await loadVenueIncident\(\)/);
  });

  it('consumes matching GET /markets — never POST /halt-all', () => {
    expect(indexSource).toMatch(/loadMatchingVenueIncident\(\{\s*matchingUrl:\s*env\.MATCHING_URL/);
    expect(indexSource).not.toMatch(/halt-all/);
  });
});
