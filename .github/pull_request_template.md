<!--
Title: <type>(<scope>): <what changed>
   e.g. feat(svc-identity): rank recalculation on XP events

Keep it small. One service per PR (§15.1). If describing it needs the word
"and", it is two PRs.
-->

## What changed

<!-- One or two sentences. The diff shows how; this says what. -->

## Why

<!-- The part a reviewer cannot reconstruct from the diff. What problem, whose
     decision, which section of the build doc. -->

## How I know it works

<!-- Tests added, what you ran, what you saw. "CI is green" is not an answer on
     a money path. -->

---

## Checks

- [ ] `pnpm verify` green locally (build · typecheck · test · DoD gate)
- [ ] Small and focused — one service
- [ ] No balance held outside the ledger (Doctrine §0.6)
- [ ] Cross-service calls go through `packages/contracts` or `packages/events` (§2)
- [ ] Migrations have a `.down.sql` reversal (§14)
- [ ] Nothing "temporary" without a §13 socket entry (§0.1)

## Money paths

<!-- Delete this section if the PR moves no value. -->

- [ ] Every recipe used has an invariant test
- [ ] Failure branches tested — insufficient funds, retry, partial, cancel
- [ ] Idempotency keys are business keys, not `randomUUID()`
- [ ] Answered: _if this crashes exactly here, whose funds are stranded?_
