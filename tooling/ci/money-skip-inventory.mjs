/**
 * MONEY-PATH SKIP INVENTORY — D26-P2-13 register.
 *
 * Every money-path test file that can decline to run must appear here with a
 * kind and a reason, or the skip must be deleted. The companion gate
 * (`money-skip-honesty-scan.mjs`) fails in both directions:
 *
 *   · a new skip under a money root that is not listed → red (register or delete)
 *   · a listed file that no longer skips / no longer exists → red (delete the row)
 *
 * This is not a licence to skip. It is the permanent ledger of which money
 * suites are allowed to be absent from a local run, so a silent grow cannot
 * look like coverage.
 *
 * Kind meanings:
 *   · infra-journalled — skip is gated by a shared CI-aware probe that journals
 *     (`postgresAvailable` / `recordInfraProbe` / `devChainReachable`)
 *   · private-probe    — still decides on a hand-rolled connection; also owed
 *     to `unreported-suites.mjs` PRIVATE_PROBE until fixed
 *   · pending          — hard `it.skip` / `test.skip` for unfinished work
 *   · opaque           — skips by some other shape; must name what lifts it
 *
 * 2026-08-15 hunt (D26-P2-13): money roots had 0 hard `it.skip` / `xit` /
 * `test.todo` / `this.skip`. Every current skip is journalled (`postgresAvailable`
 * / `recordInfraProbe`). The pay EVM live rail still skips without a node — it
 * journals; it is not gone. Do not invent pending rows to look busy.
 */

/** Money roots from D26-P2-01 promise-falsify surface (plus ledger-client). */
export const MONEY_PATH_ROOTS = [
  'services/svc-ledger',
  'services/svc-trade',
  'services/svc-pay',
  'services/svc-bank',
  'services/svc-p2p',
  'services/svc-matching',
  'services/svc-token',
  'services/svc-market',
  'services/svc-ws',
  'packages/ledger-client',
];

const PG = 'skips when Postgres unreachable; uses shared journalled postgresAvailable (local OK, CI hard-fails)';

/**
 * @type {{file: string, kind: 'infra-journalled' | 'private-probe' | 'pending' | 'opaque', why: string}[]}
 */
export const MONEY_SKIP_REGISTER = [
  // ── svc-bank ───────────────────────────

  // ── svc-ledger ───────────────────────

  // ── svc-market ───────────────────────

  // ── svc-pay ────────────────────────
  {
    file: 'services/svc-pay/src/rails/evm-chain.live.test.ts',
    kind: 'infra-journalled',
    why:
      'on-chain payment rail journals via recordInfraProbe; skips locally without anvil. ' +
      'REQUIRE_PAY_EVM=1 hard-fails. CI pay-bank shard has no anvil and does not set that gate. ' +
      'LIFTS WHEN: CI runs a chain for pay (or sets REQUIRE_PAY_EVM on a job that has one). Until then the skip stays listed.',
  },

  // ── svc-token ────────────────────

  // ── svc-trade ────────────────────
  { file: 'services/svc-trade/src/futures/portfolio-margin-refuse.money.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/futures/position-close-concurrency.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/futures/position-mode.money.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/futures/position-service.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/futures/pretrade-credit.money.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/fill-sequence-conflict.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/gtd-gtt-place.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/oco-place.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/order-route-chaos.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/order-route-properties.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/order-route-reconcile.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/order-route-seed.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/qty-up-amend.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/reduce-only-place.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/sequence-guard.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/trade-service.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/gtd-gtt-place.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/qty-up-amend.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/reduce-only-place.test.ts', kind: 'infra-journalled', why: PG },
  { file: 'services/svc-trade/src/spot/close-position.test.ts', kind: 'infra-journalled', why: PG },
];
