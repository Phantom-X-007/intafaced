import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PayError, publishedMaxOpenSessionsPerLink } from './payment-service.js';

/**
 * Owner hosted-checkout open-session cap is refuse-closed when unset.
 *
 * `z.coerce.number().default(25)` treated blank cap env as a published floor.
 * Blank is unset; 25 only when the owner publishes it.
 * Open-path refuse with a real merchant lives in payment-service.test.ts (PG-hard).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('PAY_CHECKOUT_MAX_OPEN_SESSIONS unset refuse', () => {
  it('env.ts does not default blank to 25', () => {
    const envTs = readFileSync(join(ROOT, 'services/svc-pay/src/env.ts'), 'utf8');
    expect(envTs).toMatch(/PAY_CHECKOUT_MAX_OPEN_SESSIONS:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(10_000\),/);
    expect(envTs).not.toMatch(/PAY_CHECKOUT_MAX_OPEN_SESSIONS:[\s\S]{0,80}\.default\(25\)/);
  });

  it('compose refuses missing — never a baked 25', () => {
    const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
    const start = compose.indexOf('\n  svc-pay:');
    const rest = compose.slice(start + 1);
    const next = rest.search(/\n  svc-[a-z]+:/);
    const block = next === -1 ? rest : rest.slice(0, next);
    expect(block).toMatch(
      /PAY_CHECKOUT_MAX_OPEN_SESSIONS:\s*\$\{PAY_CHECKOUT_MAX_OPEN_SESSIONS:\?missing — copy \.env\.example to \.env\}/,
    );
    expect(block).not.toMatch(/PAY_CHECKOUT_MAX_OPEN_SESSIONS:\s*\$\{PAY_CHECKOUT_MAX_OPEN_SESSIONS:-25\}/);
    expect(block).not.toMatch(/PAY_CHECKOUT_MAX_OPEN_SESSIONS:\s*['"]?25/);
  });

  it('constructor does not invent 25', () => {
    const src = readFileSync(join(ROOT, 'services/svc-pay/src/payment-service.ts'), 'utf8');
    expect(src).not.toMatch(/maxOpenSessionsPerLink = options\.maxOpenSessionsPerLink \?\? 25/);
    expect(src).toMatch(/maxOpenSessionsPerLink = options\.maxOpenSessionsPerLink \?\? null/);
    expect(src).toMatch(/pay\.checkout_max_open_sessions_unset/);
  });

  it('publishedMaxOpenSessionsPerLink refuses null rather than inventing 25', () => {
    expect(() => publishedMaxOpenSessionsPerLink(null)).toThrow(PayError);
    expect(() => publishedMaxOpenSessionsPerLink(undefined)).toThrow(
      expect.objectContaining({ code: 'pay.checkout_max_open_sessions_unset' }),
    );
    expect(publishedMaxOpenSessionsPerLink(25)).toBe(25);
    expect(publishedMaxOpenSessionsPerLink(1)).toBe(1);
  });
});
