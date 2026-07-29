#!/usr/bin/env node
/**
 * Residual #9 — fail CI before `pnpm test` if money-suite DB URLs are missing
 * or unreachable. Local runs without CI/REQUIRE_POSTGRES exit 0 (optional docker).
 *
 * Why: suites default to localhost:5433 + svc_* users and `describe.skip` when
 * unreachable. CI must set every TEST_DATABASE_URL_* and prove connectivity.
 */
import { spawnSync } from 'node:child_process';

const required = process.env.CI === 'true' || process.env.CI === '1' || process.env.REQUIRE_POSTGRES === '1';

/** @type {{ key: string, note: string }[]} */
const URLS = [
  { key: 'TEST_DATABASE_URL', note: 'shared / ledger / indexer' },
  { key: 'TEST_DATABASE_URL_PAY', note: 'svc-pay' },
  { key: 'TEST_DATABASE_URL_IDENTITY', note: 'svc-identity' },
  { key: 'TEST_DATABASE_URL_TOKEN', note: 'svc-token' },
  { key: 'TEST_DATABASE_URL_TRADE', note: 'svc-trade' },
  { key: 'TEST_DATABASE_URL_P2P', note: 'svc-p2p' },
  { key: 'TEST_DATABASE_URL_BANK', note: 'svc-bank' },
  { key: 'TEST_DATABASE_URL_BLUEPRINT', note: 'svc-blueprint' },
  { key: 'TEST_DATABASE_URL_AGENTS', note: 'svc-agents' },
];

if (!required) {
  console.log('✓ assert-test-db-env: not CI — skip hard checks');
  process.exit(0);
}

/**
 * Parse postgres://user:pass@host:port/db into psql args.
 * @param {string} url
 */
function psqlProbe(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, detail: 'invalid URL' };
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') {
    return { ok: false, detail: `unexpected protocol ${u.protocol}` };
  }
  const env = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(u.password || ''),
    PGCONNECT_TIMEOUT: '5',
  };
  const args = [
    '-h',
    u.hostname,
    '-p',
    u.port || '5432',
    '-U',
    decodeURIComponent(u.username || 'postgres'),
    '-d',
    (u.pathname || '/postgres').replace(/^\//, '') || 'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'SELECT 1',
  ];
  const r = spawnSync('psql', args, { env, encoding: 'utf8' });
  if (r.status === 0) return { ok: true, detail: 'ok' };
  const detail = (r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 240);
  return { ok: false, detail };
}

const failures = [];

for (const { key, note } of URLS) {
  const url = process.env[key];
  if (!url || !url.trim()) {
    failures.push(`${key} unset (${note})`);
    continue;
  }
  const { ok, detail } = psqlProbe(url);
  if (ok) console.log(`✓ ${key}`);
  else failures.push(`${key} (${note}): ${detail}`);
}

if (failures.length) {
  console.error('\n✖ residual #9 — money-test Postgres not ready on CI:\n');
  for (const f of failures) console.error(`  · ${f}`);
  console.error('\nFix: bootstrap tooling/infra/postgres-init + set URLs in ci.yml\n');
  process.exit(1);
}

console.log(`✓ assert-test-db-env — ${URLS.length} money-suite DB URL(s) reachable`);
