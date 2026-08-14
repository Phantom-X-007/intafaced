/**
 * Unit card — /health advertises DIRECTION:33 without inventing fund size
 * 1. Promise: insuranceListing.emptyPotBlocksLiveList true; targetSize owner_unset
 * 2. Break: /health omits the policy so ops infer a funded pot from ok:true
 * 3. Done bar: index.ts calls presentInsuranceListingPolicy
 * 4. Class N
 * 5. Paths: svc-trade/src/index.ts
 * 6. RED: no insuranceListing: presentInsuranceListingPolicy()
 * 7. Collision: #1869 listOpen pin
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(here, '..', 'index.ts'), 'utf8');

describe('insurance listing policy on /health', () => {
  it('live host mounts presentInsuranceListingPolicy on /health', () => {
    expect(indexSource).toMatch(/insuranceListing:\s*presentInsuranceListingPolicy\(\)/);
  });
});
