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
 * `svc-trade` block — and then asks the two questions that would have exited
 * the process: does every variable the env schema REQUIRES actually arrive, and
 * does the futures profit-source wiring survive the value it is handed.
 *
 * The first half is `compose-secret-parity`'s technique with its one deliberate
 * limitation removed. That gate covers SECRET-shaped names only and says so in
 * its own header — a required `DATABASE_URL` absent from compose crash-loops
 * identically and is invisible to it. Here the name filter is dropped: every
 * required variable is checked, for this one service. Requirements are read out
 * of the zod SOURCE rather than by importing it, because `env.ts` calls
 * `loadEnv(process.env)` at module scope and importing it would answer a
 * question about this machine instead of about the shipped config.
 *
 * It cannot claim the process reaches `listen`: it opens no socket, no database
 * and no bus. That statement is proven by running the container, and this file
 * is the cheap guard that keeps it true between those runs. It reads the real
 * files rather than a fixture, so it goes red when somebody edits
 * `.env.example` or the compose block — which is exactly when the question is
 * being re-asked.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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
