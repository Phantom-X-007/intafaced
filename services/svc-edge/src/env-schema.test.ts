import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Blast-radius pin: the internet-facing process must not accept secrets that
 * would let a compromised edge call the money plane or open a data store.
 *
 * Nothing used to assert this. The property held only because a human reading
 * `env.ts` noticed the omissions — and a future merge could silently add
 * `INTERNAL_SERVICE_SECRET` without a failing suite (audit 2026-08-08).
 */

const envSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'env.ts'), 'utf8');

describe('svc-edge env schema blast radius', () => {
  it('does not accept DATABASE_URL, NATS_URL, or INTERNAL_SERVICE_SECRET', () => {
    // The file must name the omissions (so the intent stays readable) and must
    // not declare them as schema keys. A bare "DATABASE_URL" string inside a
    // comment is fine; a zod key is not.
    expect(envSrc).toMatch(/no `DATABASE_URL`/i);
    expect(envSrc).toMatch(/no `NATS_URL`/i);
    expect(envSrc).toMatch(/no `INTERNAL_SERVICE_SECRET`/i);

    // Schema keys look like `KEY_NAME:` at the start of a property in the
    // object. Reject any of the forbidden names as property keys.
    for (const key of ['DATABASE_URL', 'NATS_URL', 'INTERNAL_SERVICE_SECRET']) {
      expect(envSrc, key).not.toMatch(new RegExp(`^\\s*${key}\\s*:`, 'm'));
    }
  });

  it('exposes EDGE_BODY_LIMIT_BYTES so the budget is operator-visible', () => {
    expect(envSrc).toMatch(/EDGE_BODY_LIMIT_BYTES\s*:/);
  });

  it('may hold IDENTITY_OWNERSHIP_SECRET for session live-check, never INTERNAL_SERVICE_SECRET', () => {
    expect(envSrc).toMatch(/IDENTITY_OWNERSHIP_SECRET\s*:/);
    expect(envSrc).toMatch(/Never `INTERNAL_SERVICE_SECRET`/);
  });

  it('may hold MATCHING_URL for halt-all consume, never INTERNAL_SERVICE_SECRET', () => {
    expect(envSrc).toMatch(/MATCHING_URL\s*:/);
    expect(envSrc).toMatch(/Never INTERNAL_SERVICE_SECRET \(matching POST \/halt-all is svc-trade\)/);
  });

  it('does not git-default EDGE_RATE_LIMIT_MAX to 300', () => {
    expect(envSrc).toMatch(/EDGE_RATE_LIMIT_MAX:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\),/);
    expect(envSrc).not.toMatch(/EDGE_RATE_LIMIT_MAX:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.default\(300\)/);
  });

  it('does not git-default EDGE_RATE_LIMIT_WINDOW_MS to 60000', () => {
    expect(envSrc).toMatch(/EDGE_RATE_LIMIT_WINDOW_MS:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1000\)\.max\(3_600_000\),/);
    expect(envSrc).not.toMatch(/EDGE_RATE_LIMIT_WINDOW_MS:[^\n]*?\.default\(/);
  });
});
