/**
 * D26-P1-B1 pin — public earn door stays refuse-closed when rates are unset.
 *
 * Promise: listPools throws bank.earn_rate_unset on an empty table; no default
 *   APY / APR lives in earn production modules.
 * Break: a DEFAULT_* rate, `?? <bps>` fallback, or synthetic pool with a
 *   hardcoded aprBps would make the public door look live without a configured rate.
 * Done bar: source pin always runs (no Postgres). Public-door behaviour is
 *   covered in earn-product.test.ts.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const serviceSrc = readFileSync(join(here, 'earn-service.ts'), 'utf8');
const interestSrc = readFileSync(join(here, 'interest.ts'), 'utf8');

const listPools = serviceSrc.slice(serviceSrc.indexOf('async listPools'), serviceSrc.indexOf('async fundPool'));

describe('D26-P1-B1 earn public door — no invented rate when unset', () => {
  it('listPools refuses by name instead of returning a default APY', () => {
    expect(listPools).toMatch(/bank\.earn_rate_unset/);
    expect(listPools).toMatch(/rows\.length === 0/);
    expect(listPools).not.toMatch(/DEFAULT_(APR|APY|RATE|BPS)/i);
    expect(listPools).not.toMatch(/fallback.*(apr|apy|rate)/i);
    expect(listPools).not.toMatch(/\?\?/);
    expect(listPools).not.toMatch(/\|\|\s*\d/);
    expect(listPools).not.toMatch(/aprBps\s*:/);
  });

  it('earn production modules do not ship a canned yield rate', () => {
    for (const src of [serviceSrc, interestSrc]) {
      expect(src).not.toMatch(/DEFAULT_(APR|APY|RATE|BPS)/);
      expect(src).not.toMatch(/fallbackApr|defaultApr|defaultApy/i);
      expect(src).not.toMatch(/aprBps\s*\?\?/);
      expect(src).not.toMatch(/apr_bps\s*\?\?/);
    }
    expect(interestSrc).toMatch(/function dailyInterest\(principal: Amount, aprBps: number/);
  });
});
