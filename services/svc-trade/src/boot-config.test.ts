/**
 * SVC-TRADE BOOTS ON THE CONFIGURATION THIS REPOSITORY ACTUALLY SHIPS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `pnpm platform:up` from a clean clone crash-looped svc-trade:
 *
 *     ProfitSourceConfigError: TRADE_FUTURES_PROFIT_SOURCE is not set…
 *         at profitSourceFromConfig (…/futures/profit-source.js:145:15)
 *         at file:///app/services/svc-trade/dist/index.js:116:22
 *
 * Three files each did something defensible and the combination was an outage.
 * `env.ts` defaulted the variable to `''`; `.env.example` shipped it commented
 * out because naming the account is an owner decision; compose passed
 * `${TRADE_FUTURES_PROFIT_SOURCE:-}` for the same reason; and `index.ts` threw
 * on the empty value at module scope, before `app.listen`. Down with it went
 * spot orders, ticker, orderbook, balances, fees, positions and the websocket
 * feeds — over a pot that only matters when someone closes a winning perp.
 *
 * The reason it survived review is that nothing in the repo compared those files
 * to each other. `compose-secret-parity` deliberately covers SECRET-shaped names
 * only, and its own header says so. `e2658db` — svc-ledger crash-looping on a
 * missing `JWT_ACCESS_SECRET` — is the same shape two days earlier, and that one
 * at least a secrets gate could see.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT CHECKS, AND WHAT IT CANNOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It rebuilds the environment a clean-clone `pnpm platform:up` gives THIS
 * container — `.env.example` as the env file, the compose anchors, the
 * `svc-trade` block — and then runs the two things that would have exited:
 * the env schema, and the futures profit-source wiring.
 *
 * It cannot claim the process reaches `listen`, because it does not open a
 * socket, a database or a bus. The full statement is proven by running the
 * container, and this file is the cheap guard that keeps it true between those
 * runs. It reads the real files rather than a fixture, so it goes red when
 * somebody edits `.env.example` or the compose block, which is exactly when the
 * question is being re-asked.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// `env-schema.js`, not `env.js`: importing the latter runs `loadEnv(process.env)`
// at module scope, which would answer a question this file is not asking.
import { envSchema } from './env-schema.js';
import { optionalProfitSourceFromConfig, profitSourceFromConfig } from './futures/profit-source.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** Uncommented `KEY=VALUE` lines. What `docker compose` reads out of an env file. */
function parseEnvFile(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

/**
 * `${VAR}`, `${VAR:-default}`, `${VAR:?message}` against the env file.
 *
 * `:?` is compose REFUSING to start when the value is absent, which is a
 * different and perfectly good failure — loud, at `up`, naming the variable. It
 * resolves to the env-file value here and the test below asserts one exists.
 */
function interpolate(raw: string, envFile: Map<string, string>): string {
  return raw.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::([-?])([^}]*))?\}/g, (_all, name: string, op: string, tail: string) => {
    const supplied = envFile.get(name);
    if (supplied !== undefined && supplied !== '') return supplied;
    return op === '-' ? tail : '';
  });
}

/** Strip one layer of YAML quoting from a scalar. */
const unquote = (v: string) => v.replace(/^'(.*)'$/s, '$1').replace(/^"(.*)"$/s, '$1');

/**
 * The environment one compose service ends up with: its own `environment:`
 * keys plus every `x-…: &anchor` block it merges with `<<:`.
 *
 * Regex, not a YAML parser — the repo has no YAML dependency and
 * `compose-secret-parity.mjs` reads the same file the same way. The failure
 * direction is a MISSED key, which shows up as a red test asking for a value
 * that is in fact supplied, never as a green tick over a real gap.
 */
function composeEnvironmentFor(service: string, compose: string, envFile: Map<string, string>): Map<string, string> {
  const lines = compose.split(/\r?\n/);

  const anchors = new Map<string, Map<string, string>>();
  {
    let current: Map<string, string> | null = null;
    for (const line of lines) {
      const decl = /^x-[\w-]+:\s*&([\w-]+)\s*$/.exec(line);
      if (decl) {
        current = new Map();
        anchors.set(decl[1]!, current);
        continue;
      }
      if (/^\S/.test(line)) current = null;
      if (!current) continue;
      const kv = /^ {2}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
      if (kv) current.set(kv[1]!, interpolate(unquote(kv[2]!.trim()), envFile));
    }
  }

  const out = new Map<string, string>();
  let inService = false;
  let inEnv = false;
  for (const line of lines) {
    const svcDecl = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (svcDecl) {
      inService = svcDecl[1] === service;
      inEnv = false;
      continue;
    }
    if (!inService) continue;
    if (/^ {4}\S/.test(line)) inEnv = /^ {4}environment:/.test(line);
    if (!inEnv) continue;

    const merge = /^\s*<<:\s*(?:\[([^\]]+)\]|\*([\w-]+))/.exec(line);
    if (merge) {
      const names = merge[1] ? merge[1].split(',') : [merge[2]!];
      for (const raw of names) {
        for (const [k, v] of anchors.get(raw.trim().replace(/^\*/, '')) ?? []) out.set(k, v);
      }
      continue;
    }
    const kv = /^ {6}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (kv) out.set(kv[1]!, interpolate(unquote(kv[2]!.trim()), envFile));
  }
  return out;
}

const envExample = parseEnvFile(read('.env.example'));
const shipped = composeEnvironmentFor('svc-trade', read('docker-compose.apps.yml'), envExample);

describe('svc-trade boots on shipped configuration', () => {
  /** Guard on the parser itself: an empty map would make everything below vacuous. */
  it('reads a real svc-trade compose environment', () => {
    expect(shipped.get('SERVICE_NAME')).toBe('svc-trade');
    expect(shipped.get('LEDGER_URL')).toBe('http://svc-ledger:4001');
    expect(shipped.size).toBeGreaterThan(10);
  });

  it('the env schema accepts it — no variable is required that nothing supplies', () => {
    const parsed = envSchema.safeParse(Object.fromEntries(shipped));
    const issues = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    expect(issues).toEqual([]);
  });

  /**
   * THE REGRESSION. This is the exact expression `index.ts` evaluates at module
   * scope, fed the exact string a clean clone produces. It threw, and the
   * container exited before `app.listen`.
   *
   * Reverting `optionalProfitSourceFromConfig` back to `profitSourceFromConfig`
   * in `index.ts` does not fail this test on its own — so the test asserts the
   * PROPERTY that made the revert fatal, one line down.
   */
  it('the futures profit source wiring does not throw on the shipped value', () => {
    const shippedValue = shipped.get('TRADE_FUTURES_PROFIT_SOURCE');
    expect(shippedValue).toBe('');
    expect(() => optionalProfitSourceFromConfig(shippedValue)).not.toThrow();
    expect(optionalProfitSourceFromConfig(shippedValue)).toBeNull();
  });

  /**
   * …and this is that property: the strict constructor STILL refuses an empty
   * value, so the only thing standing between the shipped config and a
   * crash-loop is `index.ts` calling the optional one. Kept as a pair so the
   * reason the optional variant exists cannot quietly evaporate.
   */
  it('the strict constructor still refuses an unnamed account — the ADR rule is intact', () => {
    expect(() => profitSourceFromConfig('')).toThrow(/TRADE_FUTURES_PROFIT_SOURCE is not set/);
  });

  it('index.ts builds the profit source with the optional constructor', () => {
    const index = read('services/svc-trade/src/index.ts');
    expect(index).toMatch(/optionalProfitSourceFromConfig\(env\.TRADE_FUTURES_PROFIT_SOURCE\)/);
    // The strict one at module scope is the defect, by name.
    expect(index).not.toMatch(/[^l]profitSourceFromConfig\(env\.TRADE_FUTURES_PROFIT_SOURCE\)/);
  });

  /**
   * `.env.example` must keep the variable UNSET. A value written there would be
   * this repository choosing the account that funds real payouts, which the ADR
   * reserves to the owner — and it would also make the test above vacuous.
   */
  it('.env.example still leaves the profit source to the owner', () => {
    expect(envExample.has('TRADE_FUTURES_PROFIT_SOURCE')).toBe(false);
    // Documented, though: an operator has to be able to find out it exists.
    expect(read('.env.example')).toMatch(/TRADE_FUTURES_PROFIT_SOURCE/);
  });

  /**
   * And compose must not grow a default either. `${VAR:-house:fees:trade:available}`
   * would make `platform:up` work by silently making the owner's decision, which
   * is the one repair the ADR forbids.
   */
  it('compose passes the profit source through with no default value', () => {
    expect(read('docker-compose.apps.yml')).toMatch(/TRADE_FUTURES_PROFIT_SOURCE:\s*\$\{TRADE_FUTURES_PROFIT_SOURCE:-\}/);
  });

  /**
   * The two fleet-wide secrets use `${VAR:?…}`, so compose refuses to start
   * without them and `.env.example` has to carry values. That is the OTHER
   * correct answer to a missing variable — loud, at `up`, naming the variable —
   * and it only works if the example file actually supplies them.
   */
  it('the secrets compose refuses to start without are present in .env.example', () => {
    for (const key of ['EDGE_PRINCIPAL_SECRET', 'INTERNAL_SERVICE_SECRET']) {
      expect(envExample.get(key), `${key} missing from .env.example`).toBeTruthy();
      expect(shipped.get(key)).toBeTruthy();
    }
  });
});
