import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PayError, publishedCheckoutSessionTtlSeconds } from './payment-service.js';

/**
 * Owner hosted-checkout session lifetime is refuse-closed when unset.
 *
 * `z.coerce.number().default(900)` treated blank TTL env as a published
 * browser handoff. Blank is unset; 900 only when the owner publishes it.
 * Open-path refuse with a real merchant lives in payment-service.test.ts (PG-hard).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('PAY_CHECKOUT_SESSION_TTL_SECONDS unset refuse', () => {
  it('env.ts does not default blank to 900', () => {
    const envTs = readFileSync(join(ROOT, 'services/svc-pay/src/env.ts'), 'utf8');
    expect(envTs).toMatch(/PAY_CHECKOUT_SESSION_TTL_SECONDS:\s*z\.coerce\.number\(\)\.int\(\)\.min\(60\)\.max\(86_400\),/);
    expect(envTs).not.toMatch(/PAY_CHECKOUT_SESSION_TTL_SECONDS:[\s\S]{0,80}\.default\(900\)/);
  });

  it('compose refuses missing — never a baked 900', () => {
    const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
    const start = compose.indexOf('\n  svc-pay:');
    const rest = compose.slice(start + 1);
    const next = rest.search(/\n  svc-[a-z]+:/);
    const block = next === -1 ? rest : rest.slice(0, next);
    expect(block).toMatch(
      /PAY_CHECKOUT_SESSION_TTL_SECONDS:\s*\$\{PAY_CHECKOUT_SESSION_TTL_SECONDS:\?missing — copy \.env\.example to \.env\}/,
    );
    expect(block).not.toMatch(/PAY_CHECKOUT_SESSION_TTL_SECONDS:\s*\$\{PAY_CHECKOUT_SESSION_TTL_SECONDS:-900\}/);
    expect(block).not.toMatch(/PAY_CHECKOUT_SESSION_TTL_SECONDS:\s*['"]?900/);
  });

  it('constructor does not invent 900', () => {
    const src = readFileSync(join(ROOT, 'services/svc-pay/src/payment-service.ts'), 'utf8');
    expect(src).not.toMatch(/checkoutSessionTtlSeconds = options\.checkoutSessionTtlSeconds \?\? 900/);
    expect(src).toMatch(/checkoutSessionTtlSeconds = options\.checkoutSessionTtlSeconds \?\? null/);
    expect(src).toMatch(/pay\.checkout_session_ttl_unset/);
  });

  it('publishedCheckoutSessionTtlSeconds refuses null rather than inventing 900', () => {
    expect(() => publishedCheckoutSessionTtlSeconds(null)).toThrow(PayError);
    expect(() => publishedCheckoutSessionTtlSeconds(undefined)).toThrow(
      expect.objectContaining({ code: 'pay.checkout_session_ttl_unset' }),
    );
    expect(publishedCheckoutSessionTtlSeconds(900)).toBe(900);
    expect(publishedCheckoutSessionTtlSeconds(60)).toBe(60);
  });
});
