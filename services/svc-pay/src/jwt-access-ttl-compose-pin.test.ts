/**
 * Unit card — compose stack passes access-token TTL / issuer / audience into svc-pay
 *
 * 1. Promise: JWT_ACCESS_TTL_SECONDS, JWT_ISSUER, and JWT_AUDIENCE from host
 *    `.env` reach the container (authEnvSchema already defaults 900 /
 *    intafaced / intafaced.api).
 * 2. Break: compose booted pay with *edge-secret + operator-credit / checkout /
 *    watcher keys but no ttl / iss / aud → host pin of token life is a no-op
 *    and the process keeps schema-only defaults forever.
 * 3. Done bar: docker-compose.apps.yml svc-pay has
 *    JWT_ACCESS_TTL_SECONDS: ${JWT_ACCESS_TTL_SECONDS:-900}
 *    JWT_ISSUER: ${JWT_ISSUER:-intafaced}
 *    JWT_AUDIENCE: ${JWT_AUDIENCE:-intafaced.api}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-pay block only)
 * 6. RED: pin fails if a unique key drops, defaults drift, JWT_ACCESS_SECRET
 *    is restamped, or checkout rails / fee bps / RPC / mnemonic / hot wallet
 *    appear
 * 7. Collision: operator-credit-rails-compose-pin.test.ts,
 *    checkout-compose-flags-pin.test.ts,
 *    checkout-session-cap-compose-pin.test.ts,
 *    crypto-watcher-compose-pin.test.ts, and
 *    link-ttl-compose-pin.test.ts — this pin does not restamp webhook secrets,
 *    watcher, checkout TTL/path/sessions, sandbox-allow, link TTL, risk band,
 *    or operator-credit rails
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

const TTL = /^\s+JWT_ACCESS_TTL_SECONDS:\s*\$\{JWT_ACCESS_TTL_SECONDS:-900\}\s*$/gm;
const ISSUER = /^\s+JWT_ISSUER:\s*\$\{JWT_ISSUER:-intafaced\}\s*$/gm;
const AUDIENCE = /^\s+JWT_AUDIENCE:\s*\$\{JWT_AUDIENCE:-intafaced\.api\}\s*$/gm;
const WEBHOOK_CRYPTO = /^\s+PAY_CRYPTO_WEBHOOK_SECRET:\s*\$\{PAY_CRYPTO_WEBHOOK_SECRET:\?missing — copy \.env\.example to \.env\}\s*$/gm;
const WEBHOOK_SANDBOX =
  /^\s+PAY_CARD_SANDBOX_WEBHOOK_SECRET:\s*\$\{PAY_CARD_SANDBOX_WEBHOOK_SECRET:\?missing — copy \.env\.example to \.env\}\s*$/gm;
const WATCHER_ENABLED = /^\s+PAY_CRYPTO_WATCHER_ENABLED:\s*\$\{PAY_CRYPTO_WATCHER_ENABLED:-true\}\s*$/gm;
const WATCHER_INTERVAL = /^\s+PAY_CRYPTO_WATCHER_INTERVAL_MS:\s*\$\{PAY_CRYPTO_WATCHER_INTERVAL_MS:-2000\}\s*$/gm;
const CHECKOUT_TTL = /^\s+PAY_CHECKOUT_SESSION_TTL_SECONDS:\s*\$\{PAY_CHECKOUT_SESSION_TTL_SECONDS:-900\}\s*$/gm;
const BASE_PATH = /^\s+PAY_PUBLIC_BASE_PATH:\s*\$\{PAY_PUBLIC_BASE_PATH:-\/api\/pay\}\s*$/gm;
const SANDBOX = /^\s+PAY_ALLOW_SANDBOX_RAILS:\s*\$\{PAY_ALLOW_SANDBOX_RAILS:-false\}\s*$/gm;
const MAX_OPEN = /^\s+PAY_CHECKOUT_MAX_OPEN_SESSIONS:\s*\$\{PAY_CHECKOUT_MAX_OPEN_SESSIONS:-25\}\s*$/gm;
const RISK_BAND = /^\s+PAY_CHECKOUT_RISK_BAND:\s*\$\{PAY_CHECKOUT_RISK_BAND:-\}\s*$/gm;
const DEFAULT_TTL = /^\s+PAY_LINK_DEFAULT_TTL_DAYS:\s*\$\{PAY_LINK_DEFAULT_TTL_DAYS:-30\}\s*$/gm;
const MAX_TTL = /^\s+PAY_LINK_MAX_TTL_DAYS:\s*\$\{PAY_LINK_MAX_TTL_DAYS:-365\}\s*$/gm;
const OPERATOR_CREDIT = /^\s+PAY_OPERATOR_CREDIT_RAILS:\s*\$\{PAY_OPERATOR_CREDIT_RAILS:-card-sandbox\}\s*$/gm;

describe('compose access-token TTL issuer audience for svc-pay', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const authEnv = readFileSync(join(ROOT, 'packages/config/src/env.ts'), 'utf8');
  const block = payServiceBlock(compose);

  it('authEnvSchema still defaults ttl / issuer / audience this pin tracks', () => {
    expect(authEnv).toMatch(/JWT_ACCESS_TTL_SECONDS:\s*z\.coerce\.number\(\)\.int\(\)\.min\(60\)\.max\(3600\)\.default\(900\)/);
    expect(authEnv).toMatch(/JWT_ISSUER:\s*z\.string\(\)\.default\('intafaced'\)/);
    expect(authEnv).toMatch(/JWT_AUDIENCE:\s*z\.string\(\)\.default\('intafaced\.api'\)/);
  });

  it('compose svc-pay block passes unique keys once; defaults 900 / intafaced / intafaced.api', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-pay/);
    expect(block.match(TTL)).toHaveLength(1);
    expect(block.match(ISSUER)).toHaveLength(1);
    expect(block.match(AUDIENCE)).toHaveLength(1);
  });

  it('does not restamp JWT_ACCESS_SECRET, webhook, watcher, checkout, link, or operator-credit', () => {
    expect(block).not.toMatch(/JWT_ACCESS_SECRET:/);
    expect(block.match(WEBHOOK_CRYPTO)).toHaveLength(1);
    expect(block.match(WEBHOOK_SANDBOX)).toHaveLength(1);
    expect(block.match(WATCHER_ENABLED)).toHaveLength(1);
    expect(block.match(WATCHER_INTERVAL)).toHaveLength(1);
    expect(block.match(CHECKOUT_TTL)).toHaveLength(1);
    expect(block.match(BASE_PATH)).toHaveLength(1);
    expect(block.match(SANDBOX)).toHaveLength(1);
    expect(block.match(MAX_OPEN)).toHaveLength(1);
    expect(block.match(RISK_BAND)).toHaveLength(1);
    expect(block.match(DEFAULT_TTL)).toHaveLength(1);
    expect(block.match(MAX_TTL)).toHaveLength(1);
    expect(block.match(OPERATOR_CREDIT)).toHaveLength(1);
    expect(block).not.toMatch(/PAY_CHECKOUT_RAILS:/);
    expect(block).not.toMatch(/PAY_DEFAULT_FEE_BPS:/);
    expect(block).not.toMatch(/PAY_CRYPTO_RPC_URL:/);
    expect(block).not.toMatch(/PAY_CRYPTO_CHAIN_ID:/);
    expect(block).not.toMatch(/PAY_CRYPTO_DEPOSIT_MNEMONIC:/);
    expect(block).not.toMatch(/PAY_CRYPTO_HOT_WALLET_KEY:/);
  });
});
