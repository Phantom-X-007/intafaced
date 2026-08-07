#!/usr/bin/env node
/**
 * ORDER BOOK MICROBENCHMARK — the first thing in this repo that measures speed.
 *
 * WHY IT DID NOT EXIST, AND WHY IT DOES NOW
 *
 * `services/svc-matching/src/engine/book.ts` is ~670 lines and is the hot path
 * of the whole platform: every order in every market goes through `submit`.
 * Nothing anywhere in the repo measured it — no k6, no artillery, no
 * autocannon, no benchmark runner in any package.json. §14's Definition of Done
 * asks for "at least one SLO dashboard panel in Grafana" and that line has
 * stayed an unchecked manual sign-off, because there was no number to put on a
 * panel.
 *
 * It is newly worth doing. Until the TracerProvider landed (#889) every span in
 * all eighteen services went to a no-op tracer, so there was no latency data to
 * compare a benchmark against. Now there is.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
 *
 * NOT A GATE, and it must not become one on this evidence. A microbenchmark on
 * a laptop with 190 git worktrees and a Docker stack running measures that
 * machine on that afternoon. Numbers move 2x between runs on shared CI runners,
 * and a threshold built on them fails honest PRs until somebody deletes it —
 * the same trap `shell-i18n-scan` documents from the other direction.
 *
 * Its job is to make a REGRESSION VISIBLE TO A HUMAN who is already suspicious,
 * and to give the depth/latency panels a shape to be compared against. Run it
 * before and after a change to the engine; do not run it in CI.
 *
 * NOT A LOAD TEST either — no sockets, no services, no database. This is the
 * matcher alone, which is the point: an HTTP number folds in Fastify, Postgres,
 * NATS and the ledger, and cannot tell you which of them moved.
 *
 * Usage:  pnpm perf:book  [--iterations N]
 */
import { OrderBook } from '../../services/svc-matching/dist/engine/book.js';

const SCALE = 10n ** 18n;
const scaled = (n) => BigInt(Math.round(n * 1e6)) * (SCALE / 1_000_000n);

const args = process.argv.slice(2);
const iterations = Number(args[args.indexOf('--iterations') + 1]) || 20_000;

let orderSeq = 0;
const nextId = () => `perf-${++orderSeq}`;

/** A limit order that will rest — priced away from the touch so it never matches. */
function restingOrder(side, price, qty = 1) {
  return {
    orderId: nextId(),
    accountId: `acct-${orderSeq % 64}`,
    type: 'limit',
    side,
    qty: scaled(qty),
    price: scaled(price),
    stopPrice: null,
    tif: 'GTC',
  };
}

/** A marketable order that will cross the book and generate fills. */
function takerOrder(side, price, qty) {
  return { ...restingOrder(side, price, qty), tif: 'IOC' };
}

/**
 * Timing without a dependency.
 *
 * A benchmark library would give confidence intervals and outlier rejection,
 * and it would also be a new runtime dependency on a repo that just installed a
 * supply-chain scanner. `hrtime` and a median are enough to see a 2x
 * regression, which is the only thing these numbers are trusted for.
 */
function measure(label, setup, run) {
  const state = setup();
  // Warm the JIT. Without it the first hundred iterations measure the compiler.
  for (let i = 0; i < Math.min(2_000, iterations); i++) run(state, i);

  const fresh = setup();
  const samples = new Float64Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    run(fresh, i);
    samples[i] = Number(process.hrtime.bigint() - t0) / 1000; // microseconds
  }

  const sorted = Float64Array.prototype.slice.call(samples).sort();
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const total = sorted.reduce((a, b) => a + b, 0);

  return {
    label,
    ops: Math.round(iterations / (total / 1_000_000)),
    p50: at(0.5),
    p99: at(0.99),
    max: sorted[sorted.length - 1],
  };
}

const results = [];

// ── 1 · Resting inserts into an empty-ish book ──────────────────────────────
// The common case: a maker joins the book and nothing crosses.
results.push(
  measure(
    'submit · resting limit (no cross)',
    () => new OrderBook('perf-market'),
    (book, i) => book.submit(restingOrder(i % 2 === 0 ? 'buy' : 'sell', i % 2 === 0 ? 100 - (i % 50) * 0.01 : 200 + (i % 50) * 0.01)),
  ),
);

// ── 2 · Inserts into a DEEP book ────────────────────────────────────────────
// Price-time priority means insertion walks levels. This is the shape that
// degrades first when the level structure is wrong, and it is the number to
// watch after any change to how levels are stored.
results.push(
  measure(
    'submit · resting limit into 5k-deep book',
    () => {
      const book = new OrderBook('perf-market');
      for (let i = 0; i < 5_000; i++) {
        book.submit(restingOrder('buy', 100 - (i % 500) * 0.01));
        book.submit(restingOrder('sell', 200 + (i % 500) * 0.01));
      }
      return book;
    },
    (book, i) => book.submit(restingOrder(i % 2 === 0 ? 'buy' : 'sell', i % 2 === 0 ? 100 - (i % 500) * 0.01 : 200 + (i % 500) * 0.01)),
  ),
);

// ── 3 · Crossing orders that actually match ─────────────────────────────────
// The path that produces fills — the one whose latency a user feels.
results.push(
  measure(
    'submit · IOC taker crossing resting liquidity',
    () => {
      const book = new OrderBook('perf-market');
      for (let i = 0; i < 20_000; i++) book.submit(restingOrder('sell', 100 + (i % 100) * 0.01, 1));
      return book;
    },
    (book) => book.submit(takerOrder('buy', 150, 0.5)),
  ),
);

// ── 4 · Depth reads, UNCHANGED book (the memo's hit path) ───────────────────
// svc-ws re-broadcasts depth on a loop, so between trades it asks the same
// question of the same book repeatedly. This is that pattern.
results.push(
  measure(
    'depth(50) · 10k-deep book · repeat read',
    () => {
      const book = new OrderBook('perf-market');
      for (let i = 0; i < 10_000; i++) {
        book.submit(restingOrder('buy', 100 - (i % 1000) * 0.01));
        book.submit(restingOrder('sell', 200 + (i % 1000) * 0.01));
      }
      return book;
    },
    (book) => book.depth(50),
  ),
);

// ── 5 · Depth reads, MUTATED between every call (the memo's miss path) ──────
//
// Reported next to case 4 on purpose. The memo is keyed on the book's sequence,
// so a book that changes before every read never hits it — and quoting only
// case 4 would advertise a speed-up that a busy market does not get. This is
// the number that does not improve, and it belongs in the same table as the one
// that does.
results.push(
  measure(
    'depth(50) · submit before every read (cache miss)',
    () => {
      const book = new OrderBook('perf-market');
      for (let i = 0; i < 10_000; i++) {
        book.submit(restingOrder('buy', 100 - (i % 1000) * 0.01));
        book.submit(restingOrder('sell', 200 + (i % 1000) * 0.01));
      }
      return book;
    },
    (book, i) => {
      book.submit(restingOrder('buy', 100 - (i % 1000) * 0.01));
      book.depth(50);
    },
  ),
);

const pad = (s, n) => String(s).padEnd(n);
console.log(`\norder book — ${iterations.toLocaleString()} iterations each, microseconds\n`);
console.log(`  ${pad('case', 46)} ${pad('ops/s', 12)} ${pad('p50', 10)} ${pad('p99', 10)} max`);
console.log(`  ${'-'.repeat(46)} ${'-'.repeat(12)} ${'-'.repeat(10)} ${'-'.repeat(10)} ------`);
for (const r of results) {
  console.log(
    `  ${pad(r.label, 46)} ${pad(r.ops.toLocaleString(), 12)} ${pad(r.p50.toFixed(2), 10)} ${pad(r.p99.toFixed(2), 10)} ${r.max.toFixed(2)}`,
  );
}

console.log(`
  Compare against a run of the SAME machine before your change. These numbers
  are not portable and are not a threshold — see the header for why this is
  deliberately not a gate.
`);
