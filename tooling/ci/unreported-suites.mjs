/**
 * SUITES THAT STILL SKIP WITHOUT SAYING SO — the register of what is NOT fixed.
 *
 * WHY THIS FILE EXISTS RATHER THAN AN `// eslint-disable`-SHAPED EXEMPTION
 *
 * The change that added `postgresAvailable` journalling and
 * `tooling/ci/skip-honesty-scan.mjs` could not reach every offender. Some of them
 * live in services under the human M1–M7 lock (svc-pay, svc-trade, svc-protocol,
 * svc-identity, svc-bank), which an agent may read but must not edit. Widening
 * those gates is their CODEOWNERS' call.
 *
 * That left exactly the failure mode this whole change exists to kill: a scan
 * that goes green over suites it silently gave up on, and a verdict that prints
 * "COMPLETE — every infrastructure-backed suite executed" while two money suites
 * are structurally incapable of reporting whether they ran. An exemption nobody
 * can see is the same object as a skip nobody can see.
 *
 * So the register is loud in both directions:
 *
 *   · `skip-honesty-scan.mjs` does not fail on these, but the list CANNOT GROW —
 *     a new private probe anywhere else is still red.
 *   · It also cannot GO STALE. If an entry stops violating, the scan fails and
 *     tells you to delete the entry. An exemption outlives its reason by default;
 *     this one has to be removed on purpose.
 *   · `infra-verdict.mjs` refuses to say COMPLETE while any entry stands. The
 *     strongest sentence it can print becomes "complete except for the suites
 *     below, which cannot report either way" — which is the true one.
 *
 * Every entry is a debt with a named owner, not a decision.
 */

/**
 * Test files that decide whether to run using a connection they opened
 * themselves. `catch { return false }` — so `CI=true` and `REQUIRE_POSTGRES=1`
 * do nothing to them, and they skip on CI counted as passes.
 *
 * @type {{file: string, dependency: string, owner: string, why: string}[]}
 */
export const PRIVATE_PROBE = [
  {
    file: 'services/svc-pay/src/payment-service.test.ts',
    dependency: 'postgres',
    owner: 'svc-pay CODEOWNERS (M1–M7 human lock)',
    why:
      'a money suite — merchant payments against the ledger. Its private `reachable()` is the same eight lines the ' +
      'four fixed suites carried. The one-line fix is `const available = await postgresAvailable(URL)`, identical to ' +
      'services/svc-p2p/src/p2p-service.test.ts in this change; it was not applied here only because svc-pay is locked.',
  },
  {
    file: 'services/svc-pay/src/rails/evm-chain.live.test.ts',
    dependency: 'evm-chain',
    owner: 'svc-pay CODEOWNERS (M1–M7 human lock)',
    why:
      'a money suite — the on-chain payment rail. Two holes, not one: the probe is private AND the gate is ' +
      '`REQUIRE_PAY_EVM=1`, which CI does not set, so it skips on every CI run today and always has. Widening that ' +
      "gate is a real decision about what CI must have running, which is svc-pay's to make and not this change's.",
  },
];

/**
 * Files whose skip guard DOES call a shared probe — so `skip-honesty-scan` is
 * satisfied — but whose probe does not write to the infra journal. They cannot
 * skip dishonestly, yet the verdict still cannot count them, so "COMPLETE" would
 * be a claim about suites nobody measured.
 *
 * @type {{file: string, probeSource: string, dependency: string, owner: string, why: string}[]}
 */
export const UNJOURNALLED = [
  'services/svc-protocol/src/accounts/create2-onchain.test.ts',
  'services/svc-protocol/src/amm/mint-swap-onchain.test.ts',
  'services/svc-protocol/src/amm/pool-factory-onchain.test.ts',
  'services/svc-protocol/src/chain/refusal-without-chain.test.ts',
  'services/svc-protocol/src/launch/router-launch-live.test.ts',
  'services/svc-protocol/src/launch/token-factory-onchain.test.ts',
  'services/svc-protocol/src/router.live-chain.test.ts',
].map((file) => ({
  file,
  probeSource: 'services/svc-protocol/scripts/dev-chain.ts',
  dependency: 'evm-chain',
  owner: 'svc-protocol CODEOWNERS (M1–M7 human lock)',
  /**
   * Enumerated rather than described as "svc-protocol's chain suites". The first
   * draft of this register named two of them — the two that skip the whole file —
   * and missed the five that skip a describe block, which is the same silence in
   * a shape that reads as smaller. Undercounting the register is the identical
   * error to undercounting the suites; both produce a number a reader trusts.
   */
  why:
    "skips on `devChainReachable`, which is honest but silent: svc-protocol's copy does not call " +
    "recordInfraProbe, so the verdict cannot count this suite either way. svc-indexer's copy of the " +
    "same helper is journalled in this change; svc-protocol's is byte-identical work, left alone only " +
    'because the service is under the human lock.',
}));

/** Flat view for anything that just needs the file names. */
export const ALL_UNREPORTED = [...PRIVATE_PROBE, ...UNJOURNALLED];
