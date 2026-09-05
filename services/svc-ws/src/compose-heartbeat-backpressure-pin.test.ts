import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Unit card — compose stack passes heartbeat and backpressure caps into svc-ws
 *
 * 1. Promise: host `.env` can pin WS_HEARTBEAT_MS, WS_HIGH_WATER_BYTES, and
 *    WS_MAX_LAG_TICKS (env.ts already declares them). Per-user cap is
 *    owner-published in max-connections-compose-pin.test.ts.
 * 2. Break: compose booted ws without the names → operator heartbeat / lag
 *    is a no-op and the container always uses schema defaults.
 * 3. Done bar: docker-compose.apps.yml svc-ws has
 *    WS_HEARTBEAT_MS: ${WS_HEARTBEAT_MS:-30000}
 *    WS_HIGH_WATER_BYTES: ${WS_HIGH_WATER_BYTES:-1048576}
 *    WS_MAX_LAG_TICKS: ${WS_MAX_LAG_TICKS:-20}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-ws block only)
 * 6. RED: pin fails if a unique key drops, is duplicated, or defaults drift
 * 7. Collision: existing DEPTH_LIMIT / POLL / GATEWAY / MARKETS_REFRESH /
 *    MAX_CONNECTIONS / TRADE_URL / JWT — this pin does not restamp them.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const HEARTBEAT = 'WS_HEARTBEAT_MS';
const HIGH_WATER = 'WS_HIGH_WATER_BYTES';
const LAG = 'WS_MAX_LAG_TICKS';

const KEYS = [
  { name: HEARTBEAT, fallback: '30000', envDefault: '30_000' },
  { name: HIGH_WATER, fallback: '1048576', envDefault: '1_048_576' },
  { name: LAG, fallback: '20', envDefault: '20' },
] as const;

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

describe('compose passes heartbeat and backpressure caps into svc-ws', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-ws/src/env.ts'), 'utf8');
  const block = wsComposeBlock();

  it('env.ts still declares the flags this pin tracks (defaults 30000 / 1048576 / 20)', () => {
    for (const key of KEYS) {
      expect(envTs).toMatch(new RegExp(`${key.name}:[\\s\\S]{0,200}?\\.default\\(\\s*${key.envDefault}\\s*\\)`));
    }
  });

  it('compose svc-ws block passes unique keys once with env.ts defaults', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-ws/);
    for (const key of KEYS) {
      expect(block, `${key.name} missing from svc-ws compose environment`).toMatch(
        new RegExp(`${key.name}:\\s*\\$\\{${key.name}:-${key.fallback}\\}`),
      );
    }
  });

  it('names each key once in compose (no duplicate assignments)', () => {
    for (const key of KEYS) {
      expect(countAssignments(compose, key.name), `${key.name} must appear once`).toBe(1);
      expect(countAssignments(block, key.name), `${key.name} must appear once on svc-ws`).toBe(1);
    }
  });

  it('does not restamp gateway/depth/trade/jwt', () => {
    expect(block).toMatch(/WS_DEPTH_LIMIT:\s*\$\{WS_DEPTH_LIMIT:-\}/);
    expect(block).toMatch(/WS_POLL_INTERVAL_MS:\s*\$\{WS_POLL_INTERVAL_MS:-250\}/);
    expect(block).toMatch(/WS_GATEWAY_ENABLED:\s*\$\{WS_GATEWAY_ENABLED:-true\}/);
    expect(block).toMatch(/WS_MARKETS_REFRESH_MS:\s*\$\{WS_MARKETS_REFRESH_MS:-30000\}/);
    expect(block).toMatch(/WS_MAX_CONNECTIONS:\s*\$\{WS_MAX_CONNECTIONS:-\}/);
    expect(block).toMatch(/TRADE_URL:\s*http:\/\/svc-trade:4004/);
  });
});
