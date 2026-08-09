import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Digest/combined pure helpers look like a product surface. Production dispatch
 * never imports them (closeout: LANE-CLOSEOUT-OPS-2026-08-08 — cadence law open).
 * This test pins that: if someone wires hold_digest without product law, CI fails.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function source(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('digest/combined are pure helpers — not production product', () => {
  it('dispatch never imports preferences/digest or combined', () => {
    const dispatch = source('dispatch.ts');
    expect(dispatch).not.toMatch(/preferences\/digest/);
    expect(dispatch).not.toMatch(/preferences\/combined/);
    expect(dispatch).not.toMatch(/hold_digest|decideChannelDelivery/);
  });

  it('router never exposes a digest cadence API', () => {
    const router = source('router.ts');
    expect(router).not.toMatch(/digest/i);
  });

  it('index never constructs a digest store', () => {
    const index = source('index.ts');
    expect(index).not.toMatch(/DigestStore|digest\.ts|combined\.ts/);
  });
});
