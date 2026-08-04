#!/usr/bin/env node
/**
 * INTAFACED - runner for the market history seeder.
 *
 * The seeding logic lives in `seed-market-data.js`, which is a Mongo SHELL
 * script: it needs BSON constructors (NumberLong, NumberInt) and the `db`
 * global, so it cannot be run by plain node. This wrapper copies it into the
 * Mongo container and executes it there, which also means the seeder works with
 * no npm driver installed and no port exposed.
 *
 * The shell runs in a SEPARATE throwaway container, not inside the server. The
 * server is pinned to mongo:4.4 (the vendored Spring Boot 1.5.9 driver speaks
 * OP_QUERY, removed in MongoDB 5.1) and that image ships only the legacy
 * `mongo` shell, which has no BigInt — and this seeder is BigInt throughout so
 * that no price is ever a JavaScript double. mongosh talks to 4.4 happily over
 * OP_MSG, so the server keeps its pin and the seeder keeps its integers. See
 * the block above the `docker run` below.
 *
 * Run:
 *   node vendor/upstream-exchange/seed-market-data.mjs
 *   node vendor/upstream-exchange/seed-market-data.mjs --restart-market
 *
 * --restart-market matters more than it looks. The market service does not read
 * /market/symbol-thumb out of Mongo on every call: `ApplicationEvent` builds an
 * in-memory CoinThumb per pair at startup from today's 1min candles and serves
 * that. Seeding candles under a running service leaves the chart correct and
 * every thumbnail still at zero until it is restarted.
 *
 * KNOWN LIMIT - this seeds history, it does not simulate a live market.
 * With no matching engine traffic the service keeps appending flat 1min candles
 * at the last seeded close, and at 00:00 UTC `resetThumb()` clears open/high/low
 * for the new day and nothing refills them, so the thumbnails drift back toward
 * zero. Re-running this script (and restarting the market service) restores a
 * full day. Until real fills exist, run it daily.
 *
 * Environment:
 *   COINEX_MONGO_CONTAINER  default intafaced-coinex-mongo
 *   COINEX_MONGO_DB         default bitrade
 *   COINEX_MARKET_CONTAINER default intafaced-coinex-market
 *   MARKET_SEED, MARKET_SEED_DAYS, MARKET_SEED_MIN_DAYS, MARKET_SEED_SYMBOLS
 *     are passed through to the seeder - see the header of seed-market-data.js.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'seed-market-data.js');

const MONGO = process.env.COINEX_MONGO_CONTAINER || 'intafaced-coinex-mongo';
const DB = process.env.COINEX_MONGO_DB || 'bitrade';
const MARKET = process.env.COINEX_MARKET_CONTAINER || 'intafaced-coinex-market';
const RESTART = process.argv.includes('--restart-market');
/* Any image carrying mongosh. It is a CLIENT only — it never stores anything,
   and it is not the version of the server it talks to. */
const SHELL_IMAGE = process.env.COINEX_MONGOSH_IMAGE || 'mongo:6';

const PASS_THROUGH = ['MARKET_SEED', 'MARKET_SEED_DAYS', 'MARKET_SEED_MIN_DAYS', 'MARKET_SEED_SYMBOLS'];

function run(args, opts = {}) {
  const result = spawnSync('docker', args, { stdio: 'inherit', ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error('docker ' + args.slice(0, 2).join(' ') + ' exited ' + result.status);
  }
}

/* Fail on a stopped container with the reason, not with a shell stack trace
   about a connection that was never going to happen. */
const probe = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', MONGO], { encoding: 'utf8' });
if (probe.status !== 0 || probe.stdout.trim() !== 'true') {
  console.error('container "' + MONGO + '" is not running. Start the stack first:');
  console.error('  docker compose -f vendor/upstream-exchange-compose.yml up -d');
  process.exit(1);
}

const envArgs = [];
for (const key of PASS_THROUGH) {
  if (process.env[key]) envArgs.push('-e', key + '=' + process.env[key]);
}

/* ── The shell is NOT the one inside the server container, and cannot be ───────
 *
 * The server is pinned to mongo:4.4 (see upstream-exchange-compose.yml: the vendored
 * Spring Boot 1.5.9 driver speaks OP_QUERY, which MongoDB 5.1 removed). That
 * image ships only the legacy `mongo` shell, whose SpiderMonkey predates
 * BigInt — and this seeder is BigInt throughout, deliberately, because every
 * price and amount is a scaled integer and never a JavaScript double. Running
 * it there dies at the first BigInt literal:
 *
 *   SyntaxError: identifier starts immediately after numeric literal
 *
 * The two requirements are not actually in conflict: the SERVER has to be 4.4,
 * the SHELL does not. mongosh speaks OP_MSG, which 4.4 answers perfectly well.
 * So the seeder runs in a throwaway mongosh container pointed at the pinned
 * server, and the money arithmetic keeps its integer guarantee.
 *
 * `--network container:<MONGO>` shares the server's network namespace, so
 * 127.0.0.1:27017 reaches it without depending on the compose network's name
 * or on any published port. Nothing is left behind (--rm) and nothing is
 * copied into the server container. */
run([
  'run', '--rm', ...envArgs,
  '--network', 'container:' + MONGO,
  '-v', SCRIPT + ':/tmp/seed-market-data.js:ro',
  SHELL_IMAGE,
  'mongosh', 'mongodb://127.0.0.1:27017/' + DB, '--quiet', '--file', '/tmp/seed-market-data.js',
]);

if (RESTART) {
  console.log('');
  console.log('restarting ' + MARKET + ' so it rebuilds its 24h summaries...');
  run(['restart', MARKET]);
  console.log('restarted. Give it ~30s to re-register with Eureka, then:');
  console.log('  curl -s -X POST http://127.0.0.1:8090/market/symbol-thumb');
} else {
  console.log('');
  console.log('candles are in. /market/symbol-thumb is served from an in-memory');
  console.log('summary built at startup, so restart the market service to refresh it:');
  console.log('  docker restart ' + MARKET);
  console.log('or re-run this script with --restart-market.');
}
