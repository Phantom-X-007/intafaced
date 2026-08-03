import { defineConfig } from 'vitest/config';

/**
 * ONE DATABASE, ONE FILE AT A TIME.
 *
 * svc-p2p has two suites that talk to Postgres — `p2p-service.test.ts` (escrow)
 * and `instrument-service.test.ts` (payment instruments) — and they are not
 * separable by table. An instrument is attached to a trade, a trade belongs to
 * an offer, and the disclosure rules are decided from the trade's status, so
 * the instrument suite has to create real offers and real trades. Both suites
 * therefore TRUNCATE the same connected set between tests.
 *
 * Vitest runs test FILES in parallel by default, so without this the two delete
 * each other's rows mid-assertion. That does not fail cleanly: it surfaces as
 * "trade not found" immediately after a successful take, in tests that have
 * nothing to do with the change being made — 24 of them, in the run that
 * produced this file, spread across both suites and every one of them a false
 * red. The same hazard is documented in `svc-pay/src/payment-service.test.ts`,
 * which solved it by keeping one connected table set in one file.
 *
 * That option was available here and was rejected: it would mean a single
 * ~2,000-line suite in which the escrow invariants and the disclosure rules —
 * two genuinely different subjects — are read together because of a test-runner
 * default. Serialising the files costs a few seconds of wall clock and keeps
 * each subject readable on its own.
 *
 * The pure suites (state, pricing, reputation, field validation) touch no
 * database and are unaffected by anything here; they are milliseconds.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
  },
});
