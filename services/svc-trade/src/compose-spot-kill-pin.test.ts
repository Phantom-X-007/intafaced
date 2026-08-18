/**
 * Unit card — compose stack passes TRADE_SPOT_ENABLED into svc-trade
 *
 * 1. Promise: host `.env` can halt new spot places (env.ts already defaults
 *    true; OFF stops new orders, cancels still work).
 * 2. Break: compose named slippage/convert/algo/futures/mm/otc/copy/options/
 *    candle/reconcile but not TRADE_SPOT_ENABLED → host kill is a no-op and
 *    the container keeps the schema default forever.
 * 3. Done bar: docker-compose.apps.yml svc-trade has
 *    TRADE_SPOT_ENABLED: ${TRADE_SPOT_ENABLED:-true}
 * 4. Class N/P
 * 5. Paths: docker-compose.apps.yml (svc-trade block only)
 * 6. RED: pin fails if the key drops, is duplicated, or defaults false
 * 7. Collision: this pin does not restamp slippage, convert, algo, futures,
 *    MM seed, OTC, copy, options, candle, or reconcile.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const SPOT = 'TRADE_SPOT_ENABLED';

function tradeComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const start = compose.indexOf('\n  svc-trade:');
  expect(start, 'svc-trade service missing from docker-compose.apps.yml').toBeGreaterThanOrEqual(0);
  const rest = compose.slice(start + 1);
  const next = rest.search(/\n  svc-[a-z]+:/);
  return next === -1 ? rest : rest.slice(0, next);
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

describe('compose passes spot kill-switch into svc-trade', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-trade/src/env.ts'), 'utf8');
  const block = tradeComposeBlock();

  it('env.ts still defaults TRADE_SPOT_ENABLED true (halt is host-explicit)', () => {
    expect(envTs).toMatch(/TRADE_SPOT_ENABLED:\s*z/);
    expect(envTs).toMatch(/TRADE_SPOT_ENABLED:[\s\S]{0,280}?\.default\(\s*true\s*\)/);
    expect(envTs).not.toMatch(/TRADE_SPOT_ENABLED:[\s\S]{0,280}?\.default\(\s*false\s*\)/);
  });

  it('compose svc-trade block passes the kill from the host with default true', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-trade/);
    expect(block, `${SPOT} missing true-default pass-through`).toMatch(new RegExp(`${SPOT}:\\s*\\$\\{${SPOT}:-true\\}`));
    expect(block).not.toMatch(new RegExp(`${SPOT}:\\s*\\$\\{${SPOT}:-false\\}`));
  });

  it('names TRADE_SPOT_ENABLED once in compose (no duplicate assignments)', () => {
    expect(countAssignments(compose, SPOT), `${SPOT} must appear once`).toBe(1);
    expect(countAssignments(block, SPOT), `${SPOT} must appear once on svc-trade`).toBe(1);
  });
});
