import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PayError, publishedLinkDefaultTtlDays, publishedLinkMaxTtlDays } from './payment-service.js';

/**
 * Owner payment-link default / max lifetime is refuse-closed when unset.
 *
 * `z.coerce.number().default(30)` / `.default(365)` treated blank TTL env as a
 * published capability URL. Blank is unset; 30 / 365 only when the owner
 * publishes them. Mint-path refuse with a real merchant lives in
 * payment-service.test.ts (PG-hard).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('PAY_LINK_DEFAULT_TTL_DAYS unset refuse', () => {
  it('env.ts does not default blank to 30', () => {
    const envTs = readFileSync(join(ROOT, 'services/svc-pay/src/env.ts'), 'utf8');
    expect(envTs).toMatch(/PAY_LINK_DEFAULT_TTL_DAYS:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(3_650\),/);
    expect(envTs).not.toMatch(/PAY_LINK_DEFAULT_TTL_DAYS:[\s\S]{0,80}\.default\(30\)/);
  });

  it('compose refuses missing — never a baked 30', () => {
    const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
    const start = compose.indexOf('\n  svc-pay:');
    const rest = compose.slice(start + 1);
    const next = rest.search(/\n  svc-[a-z]+:/);
    const block = next === -1 ? rest : rest.slice(0, next);
    expect(block).toMatch(/PAY_LINK_DEFAULT_TTL_DAYS:\s*\$\{PAY_LINK_DEFAULT_TTL_DAYS:\?missing — copy \.env\.example to \.env\}/);
    expect(block).not.toMatch(/PAY_LINK_DEFAULT_TTL_DAYS:\s*\$\{PAY_LINK_DEFAULT_TTL_DAYS:-30\}/);
    expect(block).not.toMatch(/PAY_LINK_DEFAULT_TTL_DAYS:\s*['"]?30/);
  });

  it('constructor does not invent 30', () => {
    const src = readFileSync(join(ROOT, 'services/svc-pay/src/payment-service.ts'), 'utf8');
    expect(src).not.toMatch(/linkDefaultTtlDays = options\.linkDefaultTtlDays \?\? 30/);
    expect(src).toMatch(/linkDefaultTtlDays = options\.linkDefaultTtlDays \?\? null/);
    expect(src).toMatch(/pay\.link_ttl_unset/);
  });

  it('publishedLinkDefaultTtlDays refuses null rather than inventing 30', () => {
    expect(() => publishedLinkDefaultTtlDays(null)).toThrow(PayError);
    expect(() => publishedLinkDefaultTtlDays(undefined)).toThrow(expect.objectContaining({ code: 'pay.link_ttl_unset' }));
    expect(publishedLinkDefaultTtlDays(30)).toBe(30);
    expect(publishedLinkDefaultTtlDays(1)).toBe(1);
  });
});

describe('PAY_LINK_MAX_TTL_DAYS unset refuse', () => {
  it('env.ts does not default blank to 365', () => {
    const envTs = readFileSync(join(ROOT, 'services/svc-pay/src/env.ts'), 'utf8');
    expect(envTs).toMatch(/PAY_LINK_MAX_TTL_DAYS:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(3_650\),/);
    expect(envTs).not.toMatch(/PAY_LINK_MAX_TTL_DAYS:[\s\S]{0,80}\.default\(365\)/);
  });

  it('compose refuses missing — never a baked 365', () => {
    const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
    const start = compose.indexOf('\n  svc-pay:');
    const rest = compose.slice(start + 1);
    const next = rest.search(/\n  svc-[a-z]+:/);
    const block = next === -1 ? rest : rest.slice(0, next);
    expect(block).toMatch(/PAY_LINK_MAX_TTL_DAYS:\s*\$\{PAY_LINK_MAX_TTL_DAYS:\?missing — copy \.env\.example to \.env\}/);
    expect(block).not.toMatch(/PAY_LINK_MAX_TTL_DAYS:\s*\$\{PAY_LINK_MAX_TTL_DAYS:-365\}/);
    expect(block).not.toMatch(/PAY_LINK_MAX_TTL_DAYS:\s*['"]?365/);
  });

  it('constructor does not invent 365', () => {
    const src = readFileSync(join(ROOT, 'services/svc-pay/src/payment-service.ts'), 'utf8');
    expect(src).not.toMatch(/linkMaxTtlDays = options\.linkMaxTtlDays \?\? 365/);
    expect(src).toMatch(/linkMaxTtlDays = options\.linkMaxTtlDays \?\? null/);
    expect(src).toMatch(/pay\.link_max_ttl_unset/);
  });

  it('publishedLinkMaxTtlDays refuses null rather than inventing 365', () => {
    expect(() => publishedLinkMaxTtlDays(null)).toThrow(PayError);
    expect(() => publishedLinkMaxTtlDays(undefined)).toThrow(expect.objectContaining({ code: 'pay.link_max_ttl_unset' }));
    expect(publishedLinkMaxTtlDays(365)).toBe(365);
    expect(publishedLinkMaxTtlDays(1)).toBe(1);
  });
});
