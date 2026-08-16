/**
 * Unit card — compose stack passes PAY_REGISTER_CARD_SANDBOX into svc-pay
 *
 * 1. Promise: host `.env` can pin card-sandbox registration; env.ts already
 *    types PAY_REGISTER_CARD_SANDBOX as optional `'true' | 'false'`.
 * 2. Break: compose booted pay without the name → host pin is a no-op;
 *    `${VAR:-}` interpolates empty string, which fails the enum.
 * 3. Done bar: docker-compose.apps.yml svc-pay has
 *    PAY_REGISTER_CARD_SANDBOX:
 *    (key, no value; unset omits). Do not bake true/false.
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-pay block only)
 * 6. RED: pin fails if the unique key drops, is duplicated, uses `:-`,
 *    or bakes true/false
 * 7. Collision: checkout / watcher / link / operator-credit compose pins —
 *    this pin does not restamp JWT_*, PAY_OPERATOR_CREDIT_RAILS,
 *    PAY_ALLOW_SANDBOX_RAILS, PAY_LINK_*, PAY_WEBHOOK_*, PAY_MIN_CONFIRMATIONS,
 *    watcher keys, IDENTITY_URL, LEDGER_URL
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function payServiceBlock(source: string): string {
  const match = source.match(/^  svc-pay:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m);
  if (!match) throw new Error('svc-pay service block missing from docker-compose.apps.yml');
  return match[0];
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

const LINE = /^\s+PAY_REGISTER_CARD_SANDBOX:\s*$/gm;
const OPERATOR_CREDIT = /^\s+PAY_OPERATOR_CREDIT_RAILS:\s*\$\{PAY_OPERATOR_CREDIT_RAILS:-card-sandbox\}\s*$/gm;
const SANDBOX_ALLOW = /^\s+PAY_ALLOW_SANDBOX_RAILS:\s*\$\{PAY_ALLOW_SANDBOX_RAILS:-false\}\s*$/gm;
const LINK_DEFAULT = /^\s+PAY_LINK_DEFAULT_TTL_DAYS:\s*\$\{PAY_LINK_DEFAULT_TTL_DAYS:-30\}\s*$/gm;
const LINK_MAX = /^\s+PAY_LINK_MAX_TTL_DAYS:\s*\$\{PAY_LINK_MAX_TTL_DAYS:-365\}\s*$/gm;
const WEBHOOK_TOLERANCE = /^\s+PAY_WEBHOOK_TOLERANCE_SECONDS:\s*\$\{PAY_WEBHOOK_TOLERANCE_SECONDS:-300\}\s*$/gm;
const CONFIRMATIONS = /^\s+PAY_MIN_CONFIRMATIONS:\s*\$\{PAY_MIN_CONFIRMATIONS:-6\}\s*$/gm;
const WATCHER_ENABLED = /^\s+PAY_CRYPTO_WATCHER_ENABLED:\s*\$\{PAY_CRYPTO_WATCHER_ENABLED:-true\}\s*$/gm;
const WATCHER_INTERVAL = /^\s+PAY_CRYPTO_WATCHER_INTERVAL_MS:\s*\$\{PAY_CRYPTO_WATCHER_INTERVAL_MS:-2000\}\s*$/gm;
const IDENTITY_URL = /^\s+IDENTITY_URL:\s*http:\/\/svc-identity:4002\s*$/gm;
const LEDGER_URL = /^\s+LEDGER_URL:\s*http:\/\/svc-ledger:4001\s*$/gm;

describe('compose PAY_REGISTER_CARD_SANDBOX for svc-pay', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-pay/src/env.ts'), 'utf8');
  const block = payServiceBlock(compose);

  it('env.ts still declares optional true|false enum (empty string invalid)', () => {
    expect(envTs).toMatch(/PAY_REGISTER_CARD_SANDBOX:\s*z\.enum\(\['true',\s*'false'\]\)\.optional\(\)/);
  });

  it('compose svc-pay block has the key once as key-no-value', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-pay/);
    expect(block.match(LINE)).toHaveLength(1);
    expect(countAssignments(block, 'PAY_REGISTER_CARD_SANDBOX')).toBe(1);
    expect(block).not.toMatch(/PAY_REGISTER_CARD_SANDBOX:\s*\$\{/);
    expect(block).not.toMatch(/PAY_REGISTER_CARD_SANDBOX:.*:-/);
    expect(block).not.toMatch(/PAY_REGISTER_CARD_SANDBOX:.*true/);
    expect(block).not.toMatch(/PAY_REGISTER_CARD_SANDBOX:.*false/);
  });

  it('does not invent fee/checkout rails/RPC interpolation or restamp siblings / JWT', () => {
    expect(block).not.toMatch(/PAY_DEFAULT_FEE_BPS:/);
    expect(block).not.toMatch(/PAY_CHECKOUT_RAILS:/);
    expect(block).not.toMatch(/PAY_CRYPTO_RPC_URL:\s*\$\{/);
    expect(block).not.toMatch(/^\s+JWT_/m);
    expect(block.match(OPERATOR_CREDIT)).toHaveLength(1);
    expect(block.match(SANDBOX_ALLOW)).toHaveLength(1);
    expect(block.match(LINK_DEFAULT)).toHaveLength(1);
    expect(block.match(LINK_MAX)).toHaveLength(1);
    expect(block.match(WEBHOOK_TOLERANCE)).toHaveLength(1);
    expect(block.match(CONFIRMATIONS)).toHaveLength(1);
    expect(block.match(WATCHER_ENABLED)).toHaveLength(1);
    expect(block.match(WATCHER_INTERVAL)).toHaveLength(1);
    expect(block.match(IDENTITY_URL)).toHaveLength(1);
    expect(block.match(LEDGER_URL)).toHaveLength(1);
  });
});
