/**
 * Unit card — compose stack passes access-token TTL / issuer / audience into svc-market
 *
 * 1. Promise: host `.env` can pin JWT_ACCESS_TTL_SECONDS / JWT_ISSUER /
 *    JWT_AUDIENCE for the market container (authEnvSchema defaults 900 /
 *    intafaced / intafaced.api).
 * 2. Break: compose booted market with edge-secret + TOKEN_URL + LEDGER_URL
 *    but no TTL/iss/aud → operator pin is a no-op and the container keeps
 *    schema-only defaults forever.
 * 3. Done bar: docker-compose.apps.yml svc-market has
 *    JWT_ACCESS_TTL_SECONDS: ${JWT_ACCESS_TTL_SECONDS:-900}
 *    JWT_ISSUER: ${JWT_ISSUER:-intafaced}
 *    JWT_AUDIENCE: ${JWT_AUDIENCE:-intafaced.api}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-market block only)
 * 6. RED: pin fails if any of the three lines drops, is duplicated in the
 *    market block, or the compose defaults drift
 * 7. Collision: TOKEN_URL / LEDGER_URL / MARKET_HOUSE_COMMISSION_BPS — this
 *    pin does not restamp those keys and does not invent JWT_ACCESS_SECRET
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPOSE = resolve(import.meta.dirname, '../../../docker-compose.apps.yml');
const AUTH_ENV = resolve(import.meta.dirname, '../../../packages/config/src/env.ts');

function marketServiceBlock(source: string): string {
  const match = source.match(/^  svc-market:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m);
  if (!match) throw new Error('svc-market service block missing from docker-compose.apps.yml');
  return match[0];
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

const TTL = /^\s+JWT_ACCESS_TTL_SECONDS:\s*\$\{JWT_ACCESS_TTL_SECONDS:-900\}\s*$/gm;
const ISSUER = /^\s+JWT_ISSUER:\s*\$\{JWT_ISSUER:-intafaced\}\s*$/gm;
const AUDIENCE = /^\s+JWT_AUDIENCE:\s*\$\{JWT_AUDIENCE:-intafaced\.api\}\s*$/gm;

describe('compose JWT access TTL issuer audience for svc-market', () => {
  const compose = readFileSync(COMPOSE, 'utf8');
  const authEnv = readFileSync(AUTH_ENV, 'utf8');
  const block = marketServiceBlock(compose);

  it('authEnvSchema still defaults TTL 900 issuer intafaced audience intafaced.api', () => {
    expect(authEnv).toMatch(/JWT_ACCESS_TTL_SECONDS:\s*z\.coerce\.number\(\)\.int\(\)\.min\(60\)\.max\(3600\)\.default\(900\)/);
    expect(authEnv).toMatch(/JWT_ISSUER:\s*z\.string\(\)\.default\('intafaced'\)/);
    expect(authEnv).toMatch(/JWT_AUDIENCE:\s*z\.string\(\)\.default\('intafaced\.api'\)/);
  });

  it('wires svc-market JWT_ACCESS_TTL_SECONDS JWT_ISSUER JWT_AUDIENCE once with identity defaults', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-market/);
    expect(block.match(TTL)).toHaveLength(1);
    expect(block.match(ISSUER)).toHaveLength(1);
    expect(block.match(AUDIENCE)).toHaveLength(1);
    expect(countAssignments(block, 'JWT_ACCESS_TTL_SECONDS')).toBe(1);
    expect(countAssignments(block, 'JWT_ISSUER')).toBe(1);
    expect(countAssignments(block, 'JWT_AUDIENCE')).toBe(1);
  });

  it('does not invent JWT_ACCESS_SECRET or restamp TOKEN_URL LEDGER_URL commission', () => {
    expect(block).not.toMatch(/JWT_ACCESS_SECRET:/);
    expect(block).toMatch(/TOKEN_URL:\s*http:\/\/svc-token:4003/);
    expect(block).toMatch(/LEDGER_URL:\s*http:\/\/svc-ledger:4001/);
    expect(block).toMatch(/MARKET_HOUSE_COMMISSION_BPS:\s*\$\{MARKET_HOUSE_COMMISSION_BPS:-\}/);
    expect(countAssignments(block, 'TOKEN_URL')).toBe(1);
    expect(countAssignments(block, 'LEDGER_URL')).toBe(1);
    expect(countAssignments(block, 'MARKET_HOUSE_COMMISSION_BPS')).toBe(1);
  });
});
