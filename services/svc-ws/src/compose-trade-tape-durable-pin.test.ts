import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Unit card — compose stack passes trade-tape limit and durable names into svc-ws
 *
 * 1. Promise: host `.env` can pin WS_TRADE_RECENT_LIMIT, WS_TRADES_DURABLE,
 *    and WS_PRIVATE_ORDERS_DURABLE (env.ts already declares them).
 * 2. Break: compose booted ws without the names → operator tape length /
 *    NATS durable names is a no-op and the container always uses schema defaults.
 * 3. Done bar: docker-compose.apps.yml svc-ws has
 *    WS_TRADE_RECENT_LIMIT: ${WS_TRADE_RECENT_LIMIT:-50}
 *    WS_TRADES_DURABLE: ${WS_TRADES_DURABLE:-ws-trade-tape}
 *    WS_PRIVATE_ORDERS_DURABLE: ${WS_PRIVATE_ORDERS_DURABLE:-ws-private-orders}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-ws block only)
 * 6. RED: pin fails if a unique key drops, is duplicated, or defaults drift
 * 7. Collision: existing HEARTBEAT / HIGH_WATER / LAG / PRIVATE_MAX /
 *    GATEWAY / DEPTH / POLL / MARKETS_REFRESH / MAX_CONNECTIONS — this pin
 *    does not restamp them.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const LIMIT = 'WS_TRADE_RECENT_LIMIT';
const TRADES_DURABLE = 'WS_TRADES_DURABLE';
const PRIVATE_DURABLE = 'WS_PRIVATE_ORDERS_DURABLE';

const KEYS = [
  { name: LIMIT, fallback: '50', envDefault: '50' },
  { name: TRADES_DURABLE, fallback: 'ws-trade-tape', envDefault: "'ws-trade-tape'" },
  { name: PRIVATE_DURABLE, fallback: 'ws-private-orders', envDefault: "'ws-private-orders'" },
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

describe('compose passes trade-tape limit and durable names into svc-ws', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-ws/src/env.ts'), 'utf8');
  const block = wsComposeBlock();

  it('env.ts still declares the flags this pin tracks (defaults 50 / ws-trade-tape / ws-private-orders)', () => {
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

  it('does not restamp heartbeat, backpressure, gateway, depth, poll, markets, or max-connections', () => {
    expect(block).toMatch(/WS_HEARTBEAT_MS:\s*\$\{WS_HEARTBEAT_MS:-30000\}/);
    expect(block).toMatch(/WS_HIGH_WATER_BYTES:\s*\$\{WS_HIGH_WATER_BYTES:-1048576\}/);
    expect(block).toMatch(/WS_MAX_LAG_TICKS:\s*\$\{WS_MAX_LAG_TICKS:-20\}/);
    expect(block).toMatch(/WS_PRIVATE_MAX_CONNECTIONS_PER_USER:\s*\$\{WS_PRIVATE_MAX_CONNECTIONS_PER_USER:-\}/);
    expect(block).toMatch(/WS_GATEWAY_ENABLED:\s*\$\{WS_GATEWAY_ENABLED:-true\}/);
    expect(block).toMatch(/WS_DEPTH_LIMIT:\s*\$\{WS_DEPTH_LIMIT:-\}/);
    expect(block).toMatch(/WS_POLL_INTERVAL_MS:\s*\$\{WS_POLL_INTERVAL_MS:-250\}/);
    expect(block).toMatch(/WS_MARKETS_REFRESH_MS:\s*\$\{WS_MARKETS_REFRESH_MS:-30000\}/);
    expect(block).toMatch(/WS_MAX_CONNECTIONS:\s*\$\{WS_MAX_CONNECTIONS:-\}/);
    expect(countAssignments(block, 'WS_HEARTBEAT_MS')).toBe(1);
    expect(countAssignments(block, 'WS_HIGH_WATER_BYTES')).toBe(1);
    expect(countAssignments(block, 'WS_MAX_LAG_TICKS')).toBe(1);
    expect(countAssignments(block, 'WS_PRIVATE_MAX_CONNECTIONS_PER_USER')).toBe(1);
    expect(countAssignments(block, 'WS_GATEWAY_ENABLED')).toBe(1);
    expect(countAssignments(block, 'WS_DEPTH_LIMIT')).toBe(1);
    expect(countAssignments(block, 'WS_POLL_INTERVAL_MS')).toBe(1);
    expect(countAssignments(block, 'WS_MARKETS_REFRESH_MS')).toBe(1);
    expect(countAssignments(block, 'WS_MAX_CONNECTIONS')).toBe(1);
  });
});
