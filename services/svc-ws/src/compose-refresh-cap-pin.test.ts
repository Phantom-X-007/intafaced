import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Unit card — compose stack passes listing-refresh and connection cap into svc-ws
 *
 * 1. Promise: host `.env` can pin WS_MARKETS_REFRESH_MS (env.ts already
 *    declares it). WS_MAX_CONNECTIONS is owner-published elsewhere
 *    (max-connections-compose-pin.test.ts) — this pin only tracks refresh.
 * 2. Break: compose booted ws without the refresh name → operator refresh is a
 *    no-op and the container always uses the schema default.
 * 3. Done bar: docker-compose.apps.yml svc-ws has
 *    WS_MARKETS_REFRESH_MS: ${WS_MARKETS_REFRESH_MS:-30000}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-ws block only)
 * 6. RED: pin fails if a unique key drops, is duplicated, or defaults drift
 * 7. Collision: existing DEPTH_LIMIT / POLL_INTERVAL / GATEWAY_ENABLED / TRADE_URL /
 *    JWT lines — this pin does not restamp them.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const REFRESH = 'WS_MARKETS_REFRESH_MS';
const REFRESH_FALLBACK = '30000';

function wsComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const start = compose.indexOf('\n  svc-ws:');
  expect(start, 'svc-ws service missing from docker-compose.apps.yml').toBeGreaterThanOrEqual(0);
  const rest = compose.slice(start + 1);
  const next = rest.search(/\n  svc-[a-z]+:/);
  return next === -1 ? rest : rest.slice(0, next);
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

describe('compose passes markets-refresh and connection cap into svc-ws', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-ws/src/env.ts'), 'utf8');
  const block = wsComposeBlock();

  it('env.ts still declares the refresh flag this pin tracks (default 30000)', () => {
    expect(envTs).toMatch(/WS_MARKETS_REFRESH_MS:[\s\S]{0,200}?\.default\(\s*30_000\s*\)/);
  });

  it('compose svc-ws block passes unique keys once with env.ts defaults', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-ws/);
    expect(block, `${REFRESH} missing from svc-ws compose environment`).toMatch(
      new RegExp(`${REFRESH}:\\s*\\$\\{${REFRESH}:-${REFRESH_FALLBACK}\\}`),
    );
  });

  it('names each key once in compose (no duplicate assignments)', () => {
    expect(countAssignments(compose, REFRESH), `${REFRESH} must appear once`).toBe(1);
    expect(countAssignments(block, REFRESH), `${REFRESH} must appear once on svc-ws`).toBe(1);
  });

  it('does not restamp gateway/depth/trade/jwt', () => {
    expect(block).toMatch(/WS_DEPTH_LIMIT:\s*\$\{WS_DEPTH_LIMIT:-\}/);
    expect(block).toMatch(/WS_POLL_INTERVAL_MS:\s*\$\{WS_POLL_INTERVAL_MS:-250\}/);
    expect(block).toMatch(/WS_GATEWAY_ENABLED:\s*\$\{WS_GATEWAY_ENABLED:-true\}/);
    expect(block).toMatch(/TRADE_URL:\s*http:\/\/svc-trade:4004/);
  });
});
