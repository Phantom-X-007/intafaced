/**
 * Unit card — compose stack sets IDENTITY_URL for svc-agents affiliate producer
 *
 * 1. Promise: after usage feeCharge, accrue + payout can reach identity S2S.
 * 2. Break: compose boots agents without IDENTITY_URL → noop forever even
 *    though identity is on the same network.
 * 3. Done bar: docker-compose.apps.yml svc-agents has
 *    IDENTITY_URL: http://svc-identity:4002
 *    env.ts IDENTITY_URL is optional URL with no localhost default.
 * 4. Class M (producer wire only — identity owns rates)
 * 5. Paths: docker-compose.apps.yml (svc-agents block only) + env.ts
 * 6. RED: pin fails if IDENTITY_URL drops, env defaults localhost, or
 *    AGENTS_PROVIDER mock / AUTH_HEADER / JWT_* / key-no-value upstream
 *    lines are restamped. Do not default AGENTS_PROVIDER to upstream.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function agentsServiceBlock(source: string): string {
  const match = source.match(/^  svc-agents:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m);
  if (!match) throw new Error('svc-agents service block missing from docker-compose.apps.yml');
  return match[0];
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

const IDENTITY = /^\s+IDENTITY_URL:\s*http:\/\/svc-identity:4002\s*$/gm;
const HEADER = /^\s+AGENTS_UPSTREAM_AUTH_HEADER:\s*\$\{AGENTS_UPSTREAM_AUTH_HEADER:-x-api-key\}\s*$/gm;
const PREFIX = /^\s+AGENTS_UPSTREAM_AUTH_PREFIX:\s*\$\{AGENTS_UPSTREAM_AUTH_PREFIX:-\}\s*$/gm;
const JWT_TTL = /^\s+JWT_ACCESS_TTL_SECONDS:\s*\$\{JWT_ACCESS_TTL_SECONDS:-900\}\s*$/gm;
const JWT_ISS = /^\s+JWT_ISSUER:\s*\$\{JWT_ISSUER:-intafaced\}\s*$/gm;
const JWT_AUD = /^\s+JWT_AUDIENCE:\s*\$\{JWT_AUDIENCE:-intafaced\.api\}\s*$/gm;

describe('compose IDENTITY_URL for agents affiliate producer', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-agents/src/env.ts'), 'utf8');
  const block = agentsServiceBlock(compose);

  it('env.ts declares optional IDENTITY_URL with no localhost default', () => {
    expect(envTs).toMatch(/IDENTITY_URL:\s*z\.string\(\)\.url\(\)\.optional\(\)/);
    expect(envTs).not.toMatch(/IDENTITY_URL:[\s\S]*localhost:4002/);
  });

  it('compose svc-agents block pins IDENTITY_URL to svc-identity once', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-agents/);
    expect(block.match(IDENTITY)).toHaveLength(1);
    expect(countAssignments(block, 'IDENTITY_URL')).toBe(1);
  });

  it('does not restamp AGENTS_PROVIDER mock, AUTH_HEADER, JWT_*, or key-no-value upstream', () => {
    expect(block).toMatch(/AGENTS_PROVIDER:\s*\$\{AGENTS_PROVIDER:-mock\}/);
    expect(block).not.toMatch(/AGENTS_PROVIDER:\s*\$\{AGENTS_PROVIDER:-upstream\}/);
    expect(block.match(HEADER)).toHaveLength(1);
    expect(block.match(PREFIX)).toHaveLength(1);
    expect(block.match(JWT_TTL)).toHaveLength(1);
    expect(block.match(JWT_ISS)).toHaveLength(1);
    expect(block.match(JWT_AUD)).toHaveLength(1);
    expect(block).toMatch(/^\s+AGENTS_UPSTREAM_BASE_URL:\s*$/m);
    expect(block).toMatch(/^\s+AGENTS_UPSTREAM_API_KEY:\s*$/m);
    expect(block).toMatch(/^\s+AGENTS_UPSTREAM_HEADERS:\s*$/m);
    expect(block).toMatch(/^\s+AGENTS_UPSTREAM_MODELS:\s*$/m);
    expect(block).toMatch(/^\s+AGENTS_UPSTREAM_COMPLETIONS_PATH:\s*$/m);
    expect(block).toMatch(/^\s+AGENTS_UPSTREAM_EMBEDDINGS_PATH:\s*$/m);
    expect(block).toMatch(/^\s+AGENTS_ROUTING_TABLE:\s*$/m);
  });
});
