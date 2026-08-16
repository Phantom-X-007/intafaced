/**
 * Unit card — compose stack passes access-token TTL / issuer / audience into svc-indexer
 *
 * 1. Promise: JWT_ACCESS_TTL_SECONDS, JWT_ISSUER, and JWT_AUDIENCE from host
 *    `.env` reach the container (edgeEnvSchema / identity defaults 900 /
 *    intafaced / intafaced.api). svc-indexer merges edgeEnvSchema (self-mounts /trpc).
 * 2. Break: compose booted indexer with ingest poll/batch / chain id / empty
 *    RPC / zero venue / start height / finality / ingest kill but no ttl / iss /
 *    aud → host pin of token life is a no-op and the process keeps schema-only
 *    defaults forever.
 * 3. Done bar: docker-compose.apps.yml svc-indexer has
 *    JWT_ACCESS_TTL_SECONDS: ${JWT_ACCESS_TTL_SECONDS:-900}
 *    JWT_ISSUER: ${JWT_ISSUER:-intafaced}
 *    JWT_AUDIENCE: ${JWT_AUDIENCE:-intafaced.api}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-indexer block only)
 * 6. RED: pin fails if a unique key drops inside the indexer block, defaults
 *    drift, JWT_ACCESS_SECRET is invented, or RPC/venue/ledger/signing appear
 * 7. Collision: ingest poll/batch compose pin — this pin does not restamp
 *    INDEXER_POLL_INTERVAL_MS, INDEXER_BATCH_SIZE, CHAIN_ID, empty RPC, zero
 *    venue, START_HEIGHT, FINALITY, INGEST_ENABLED
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPOSE = resolve(import.meta.dirname, '../../../docker-compose.apps.yml');
const AUTH_ENV = resolve(import.meta.dirname, '../../../packages/config/src/env.ts');
const ENV_TS = resolve(import.meta.dirname, './env.ts');

function indexerServiceBlock(source: string): string {
  const match = source.match(/^  svc-indexer:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m);
  if (!match) throw new Error('svc-indexer service block missing from docker-compose.apps.yml');
  return match[0];
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

const TTL = /^\s+JWT_ACCESS_TTL_SECONDS:\s*\$\{JWT_ACCESS_TTL_SECONDS:-900\}\s*$/gm;
const ISSUER = /^\s+JWT_ISSUER:\s*\$\{JWT_ISSUER:-intafaced\}\s*$/gm;
const AUDIENCE = /^\s+JWT_AUDIENCE:\s*\$\{JWT_AUDIENCE:-intafaced\.api\}\s*$/gm;
const POLL = /^\s+INDEXER_POLL_INTERVAL_MS:\s*\$\{INDEXER_POLL_INTERVAL_MS:-2000\}\s*$/gm;
const BATCH = /^\s+INDEXER_BATCH_SIZE:\s*\$\{INDEXER_BATCH_SIZE:-200\}\s*$/gm;

describe('compose access-token TTL issuer audience for svc-indexer', () => {
  const compose = readFileSync(COMPOSE, 'utf8');
  const authEnv = readFileSync(AUTH_ENV, 'utf8');
  const envTs = readFileSync(ENV_TS, 'utf8');
  const block = indexerServiceBlock(compose);

  it('env.ts still merges edgeEnvSchema; authEnvSchema defaults match identity', () => {
    expect(envTs).toMatch(/\.merge\(edgeEnvSchema\)/);
    expect(authEnv).toMatch(/JWT_ACCESS_TTL_SECONDS:\s*z\.coerce\.number\(\)\.int\(\)\.min\(60\)\.max\(3600\)\.default\(900\)/);
    expect(authEnv).toMatch(/JWT_ISSUER:\s*z\.string\(\)\.default\('intafaced'\)/);
    expect(authEnv).toMatch(/JWT_AUDIENCE:\s*z\.string\(\)\.default\('intafaced\.api'\)/);
  });

  it('compose svc-indexer block passes unique keys once; defaults 900 / intafaced / intafaced.api', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-indexer/);
    expect(block.match(TTL)).toHaveLength(1);
    expect(block.match(ISSUER)).toHaveLength(1);
    expect(block.match(AUDIENCE)).toHaveLength(1);
    expect(countAssignments(block, 'JWT_ACCESS_TTL_SECONDS')).toBe(1);
    expect(countAssignments(block, 'JWT_ISSUER')).toBe(1);
    expect(countAssignments(block, 'JWT_AUDIENCE')).toBe(1);
  });

  it('does not restamp ingest poll/batch/chain/rpc/venue or invent ledger/signing/secret', () => {
    expect(block.match(POLL)).toHaveLength(1);
    expect(block.match(BATCH)).toHaveLength(1);
    expect(block).toMatch(/INDEXER_CHAIN_ID:\s*\$\{PROTOCOL_CHAIN_ID:-31337\}/);
    expect(block).toMatch(/INDEXER_RPC_URL:\s*\$\{INDEXER_RPC_URL:-\}/);
    expect(block).toMatch(/INDEXER_VENUE_ADDRESS:\s*\$\{INDEXER_VENUE_ADDRESS:-0x0000000000000000000000000000000000000000\}/);
    expect(block).toMatch(/INDEXER_START_HEIGHT:\s*\$\{INDEXER_START_HEIGHT:-0\}/);
    expect(block).toMatch(/INDEXER_FINALITY_DEPTH:\s*\$\{INDEXER_FINALITY_DEPTH:-64\}/);
    expect(block).toMatch(/INDEXER_INGEST_ENABLED:\s*\$\{INDEXER_INGEST_ENABLED:-true\}/);
    expect(countAssignments(block, 'INDEXER_POLL_INTERVAL_MS')).toBe(1);
    expect(countAssignments(block, 'INDEXER_BATCH_SIZE')).toBe(1);
    expect(countAssignments(block, 'INDEXER_CHAIN_ID')).toBe(1);
    expect(countAssignments(block, 'INDEXER_RPC_URL')).toBe(1);
    expect(countAssignments(block, 'INDEXER_VENUE_ADDRESS')).toBe(1);
    expect(countAssignments(block, 'INDEXER_START_HEIGHT')).toBe(1);
    expect(countAssignments(block, 'INDEXER_FINALITY_DEPTH')).toBe(1);
    expect(countAssignments(block, 'INDEXER_INGEST_ENABLED')).toBe(1);
    expect(countAssignments(block, 'LEDGER_URL')).toBe(0);
    expect(countAssignments(block, 'JWT_ACCESS_SECRET')).toBe(0);
    expect(block).not.toMatch(/PRIVATE_KEY|SIGNING_KEY/i);
  });
});
