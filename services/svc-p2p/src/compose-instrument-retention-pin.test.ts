import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Unit card — compose stack passes instrument retention into svc-p2p
 *
 * 1. Promise: host `.env` can pin closed-trade instrument purge days
 *    (env.ts already declares P2P_INSTRUMENT_RETENTION_DAYS).
 * 2. Break: compose booted p2p without the name → operator retention is a
 *    no-op and the container always uses the schema default (90).
 * 3. Done bar: docker-compose.apps.yml svc-p2p environment names
 *    P2P_INSTRUMENT_RETENTION_DAYS with host passthrough default 90.
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-p2p block only)
 * 6. RED: pin fails if the name drops off, is duplicated, or bakes
 *    P2P_FEE_BPS / method registry / destination accounts / KMS
 * 7. Collision: offer/escrow/dispute compose pins — this pin only reads
 *    the retention key. 90d stays longer than the 7-day dispute SLA.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const KEY = 'P2P_INSTRUMENT_RETENTION_DAYS';
const FALLBACK = '90';

function p2pComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const start = compose.indexOf('\n  svc-p2p:');
  expect(start, 'svc-p2p service missing from docker-compose.apps.yml').toBeGreaterThanOrEqual(0);
  const rest = compose.slice(start + 1);
  const next = rest.search(/\n  svc-[a-z]+:/);
  return next === -1 ? rest : rest.slice(0, next);
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

describe('compose passes p2p.payment-instruments retention into svc-p2p', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-p2p/src/env.ts'), 'utf8');
  const block = p2pComposeBlock();

  it('env.ts still declares the retention this pin tracks (default 90)', () => {
    expect(envTs).toMatch(/P2P_INSTRUMENT_RETENTION_DAYS:[\s\S]{0,200}?\.default\(\s*90\s*\)/);
  });

  it('compose svc-p2p block passes retention from the host with env.ts default', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-p2p/);
    expect(block, `${KEY} missing from svc-p2p compose environment`).toMatch(new RegExp(`${KEY}:\\s*\\$\\{${KEY}:-${FALLBACK}\\}`));
  });

  it('names the retention key once in compose (no duplicate assignments)', () => {
    expect(countAssignments(compose, KEY), `${KEY} must appear once`).toBe(1);
    expect(countAssignments(block, KEY), `${KEY} must appear once on svc-p2p`).toBe(1);
  });

  it('does not bake house take, method registry, destination accounts, or KMS', () => {
    expect(block).toMatch(/P2P_FEE_BPS:\s*\$\{P2P_FEE_BPS:-\}/);
    expect(block).not.toMatch(/P2P_FEE_BPS:\s*\$\{P2P_FEE_BPS:-30\}/);
    expect(block).not.toMatch(/P2P_METHOD_REGISTRY/);
    expect(block).not.toMatch(/P2P_DESTINATION_ACCOUNT/);
    expect(block).not.toMatch(/P2P_KMS/);
  });
});
