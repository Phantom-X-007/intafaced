/**
 * Unit card — live host GET margin-call is presenter-only, no grace extra
 * 1. Promise: getOpenMarginCall returns presentMarginCallWire(row) with no extra fields
 * 2. Break: host spreads graceExpiresAt or a timer onto the REST body
 * 3. Done bar: source matches return presentMarginCallWire(row); no graceExpiresAt
 * 4. Class N
 * 5. Paths: svc-trade/src/index.ts
 * 6. RED: return { ...presentMarginCallWire(row), graceExpiresAt: … }
 * 7. Collision: none — #1924 pins transport.ts; this pins the live host assembly
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(here, '..', 'index.ts'), 'utf8');

describe('live host margin-call door does not invent grace', () => {
  it('getOpenMarginCall returns presentMarginCallWire(row) only', () => {
    expect(indexSource).toMatch(/getOpenMarginCall:/);
    expect(indexSource).toMatch(/return presentMarginCallWire\(row\)/);
  });

  it('does not attach graceExpiresAt on the host path', () => {
    expect(indexSource).not.toMatch(/graceExpiresAt/);
  });
});
