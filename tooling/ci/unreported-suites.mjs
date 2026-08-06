/**
 * SUITES THAT STILL SKIP WITHOUT SAYING SO — the register of what is NOT fixed.
 *
 * WHY THIS FILE EXISTS RATHER THAN AN `// eslint-disable`-SHAPED EXEMPTION
 *
 * The change that added `postgresAvailable` journalling and
 * `tooling/ci/skip-honesty-scan.mjs` could not reach every offender. Each entry
 * below carries the specific reason it was left and what would lift it.
 *
 * CORRECTION 2026-08-06 — THE svc-pay LOCK WAS A PHANTOM, AND IS LIFTED.
 *
 * Both svc-pay entries cited "svc-pay CODEOWNERS (M1–M7 human lock)". There is no
 * `/services/svc-pay/` line in `.github/CODEOWNERS`, only the `*` catch-all, whose
 * own comment reads "Pay/bank reclaimed for Nitro agents (Class M)." The hold cited
 * a rule that does not exist, so under `docs/adr/2026-08-04-class-m-hold-language.md`
 * requirement 1 — a hold binds only where the work is — it never bound, and it is
 * lifted here. `docs/adr/2026-08-04-pay-rails-and-psp-socket.md` had already
 * reported the contradiction: two sources disagreeing inside one CI run.
 *
 * THE ENTRIES STAY. Lifting a hold is not fixing a suite. Both files still decide
 * whether to run on a probe nobody can see, so deleting them turns a counted debt
 * back into a silent one: `skip-honesty-scan` would stop PRINTING them and start
 * FAILING on them, and `infra-verdict` would go back to claiming COMPLETE over two
 * money suites it never measured. Only the reason on each entry changed, to the
 * true one.
 *
 * svc-protocol's lock below is NOT a phantom. `/services/svc-protocol/` is a real
 * CODEOWNERS line (@shehzad002) and the chain plane is his to implement, so that
 * hold names its scope, sits where merges pass, and states who lifts it. Untouched.
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
    owner: 'Nitro agents (Class M) — blocked only by open PR #346, which edits this file',
    why:
      'a money suite — merchant payments against the ledger. Its private `reachable()` is the same eight lines the ' +
      'four fixed suites carried. The one-line fix is `const available = await postgresAvailable(URL)`, identical to ' +
      'services/svc-p2p/src/p2p-service.test.ts in that change. It was NOT left for a lock — the svc-pay lock was a ' +
      'phantom (see the correction at the top of this file). What holds it now is the dual-edit rule, which is ' +
      'stricter and real: PR #346 (shehzad002) modifies services/svc-pay/src/payment-service.test.ts on an open ' +
      'branch, and two branches editing one test file is how a merge silently loses a suite. LIFTS WHEN: #346 merges ' +
      'or closes. Then apply the one-line fix and delete this entry — the scan will fail until you do.',
  },
  {
    file: 'services/svc-pay/src/rails/evm-chain.live.test.ts',
    dependency: 'evm-chain',
    owner: 'Nitro agents (Class M) for the probe · CI infra decision for the gate — no hold on either',
    why:
      'a money suite — the on-chain payment rail. Two holes, not one, and only the second is still a reason. ' +
      'The probe is private, which is ordinary Class M work now that the phantom svc-pay lock is lifted and no open ' +
      'PR touches this file. The gate is `REQUIRE_PAY_EVM=1`, which CI does not set, so it skips on every CI run ' +
      'today and always has — and setting it is a real decision about what infrastructure CI must have running ' +
      '(an EVM node in the Tests job), not a code change. LIFTS WHEN: the probe is journalled AND CI either runs a ' +
      'chain or states that it will not. Fixing the probe alone still leaves the suite unreported, which is why the ' +
      'entry does not come out on the first half.',
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
