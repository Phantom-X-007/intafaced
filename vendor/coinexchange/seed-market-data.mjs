#!/usr/bin/env node
/**
 * INTAFACED - runner for the market history seeder.
 *
 * The seeding logic lives in `seed-market-data.js`, which is a mongosh script:
 * it needs mongosh's BSON constructors (Long, Int32) and the `db` global, so it
 * cannot be run by plain node. This wrapper copies it into the Mongo container
 * and executes it there, which also means the seeder works with no npm driver
 * installed and no port exposed.
 *
 * Run:
 *   node vendor/coinexchange/seed-market-data.mjs
 *   node vendor/coinexchange/seed-market-data.mjs --restart-market
 *
 * --restart-market matters more than it looks. The market service does not read
 * /market/symbol-thumb out of Mongo on every call: `ApplicationEvent` builds an
 * in-memory CoinThumb per pair at startup from today's 1min candles and serves
 * that. Seeding candles under a running service leaves the chart correct and
 * every thumbnail still at zero until it is restarted.
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

const PASS_THROUGH = ['MARKET_SEED', 'MARKET_SEED_DAYS', 'MARKET_SEED_MIN_DAYS', 'MARKET_SEED_SYMBOLS'];

function run(args, opts = {}) {
  const result = spawnSync('docker', args, { stdio: 'inherit', ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error('docker ' + args.slice(0, 2).join(' ') + ' exited ' + result.status);
  }
}

/* Fail on a stopped container with the reason, not with a mongosh stack trace
   about a connection that was never going to happen. */
const probe = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', MONGO], { encoding: 'utf8' });
if (probe.status !== 0 || probe.stdout.trim() !== 'true') {
  console.error('container "' + MONGO + '" is not running. Start the stack first:');
  console.error('  docker compose -f vendor/coinexchange-compose.yml up -d');
  process.exit(1);
}

run(['cp', SCRIPT, MONGO + ':/tmp/seed-market-data.js']);

const envArgs = [];
for (const key of PASS_THROUGH) {
  if (process.env[key]) envArgs.push('-e', key + '=' + process.env[key]);
}
run(['exec', ...envArgs, MONGO, 'mongosh', DB, '--quiet', '--file', '/tmp/seed-market-data.js']);

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
