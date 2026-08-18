/**
 * Unit card — margin-call public wire does not invent a D3 grace clock
 * 1. Promise: GET margin-call is delivery identity only; grace duration stays unset
 * 2. Break: wire / presenter / SQL upsert a graceExpiresAt or grace_expires_at
 * 3. Done bar: no graceExpiresAt: field, no grace_expires_at column in this file
 * 4. Class N
 * 5. Paths: svc-trade/src/futures/margin-call-transport.ts
 * 6. RED: graceExpiresAt: on MarginCallWire or INSERT grace_expires_at
 * 7. Collision: none — maintenance-ladder.ts owns the pure grace seals; this pins transport
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'margin-call-transport.ts'), 'utf8');

describe('margin-call transport does not invent a grace clock', () => {
  it('does not put graceExpiresAt on the public wire or durable row', () => {
    expect(src).not.toMatch(/graceExpiresAt\s*:/);
    expect(src).toMatch(/export interface MarginCallWire/);
    expect(src).toMatch(/export function presentMarginCallWire/);
  });

  it('SQL store does not persist a grace column', () => {
    expect(src).not.toMatch(/grace_expires_at/);
    expect(src).toMatch(/INSERT INTO trade\.position_margin_calls/);
  });
});
