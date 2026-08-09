> **Supersession (2026-08-09):** Any line that treats **Actions thrift**, run-count caps, `THRIFT_ALLOW`, or holding PRs for CI spend as current law is **void**. The repo is public; thrift was deleted 2026-08-07. See [`GITHUB-CI-SPEND-CONTROL-2026-07-31.md`](../GITHUB-CI-SPEND-CONTROL-2026-07-31.md).

# Owner GitHub config — the five settings only an admin can change

**Home for these findings.** They were queued 2026-08-04 inside `docs/BOARD-CLEAR-HUMAN-BLOCKERS.md`, a campaign file that is otherwise dead. They are not campaign artifacts — they are standing repo-security facts, and they outlived the campaign. Moved here 2026-08-07.

**Who can act:** `Phantom-X-007` is the only `admin`. `ZenYoda3` and `shehzad002` have `write`. No agent can change any of this.

**What changed since these were filed:** the repo went **public**. Every "needs GitHub Pro" blocker below was priced for a private repo and is now **free**. Four of the five are three clicks.

Re-derive before acting — do not trust this table's live column:

```
gh repo view --json visibility,isPrivate
gh api /repos/Phantom-X-007/intafaced/branches/main/protection
gh api /repos/Phantom-X-007/intafaced/rulesets
gh api /repos/Phantom-X-007/intafaced/collaborators --jq '.[] | "\(.login) \(.role_name)"'
```

| ID     | Finding                                                                                                                                                                        | State when filed (2026-08-04)                                  | Verified 2026-08-07                                                                                                                                 | Action                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1** | **No branch protection on `main`.** Any push-capable identity can force-push the trunk.                                                                                        | `protection` → 404; `rulesets` → 403 _"Upgrade to GitHub Pro"_ | **Still 404. Rulesets now return `[]`, not 403** — the paywall is gone with the public switch                                                       | Enable protection: require the CI checks, require branches up to date before merge                                                           |
| **G2** | **CODEOWNERS is advisory.** It requests reviews it cannot require, so money and chain paths can merge with zero review.                                                        | Blocked on Pro                                                 | `codeowners/errors` → `[]` (the file is correct); still unenforceable because G1 is unset                                                           | Fix falls out of G1 — require code-owner review on money + chain paths only                                                                  |
| **G3** | **`allow_auto_merge: false`.** Agents poll CI and merge by hand instead of queueing.                                                                                           | admin toggle                                                   | **Still `false`**                                                                                                                                   | Enable auto-merge                                                                                                                            |
| **G4** | **Nothing verified `main` after a merge.** `ci.yml` had no `push: main` trigger — removed as a thrift measure citing a 2,000-minute monthly pool.                              | private repo, metered                                          | **Actions are free and unlimited on public repos** (standard runners, verified against GitHub billing docs). The budget it protected does not exist | **DONE 2026-08-07** — `push: main` restored on `ci.yml`, and the whole thrift law deleted with it. No owner action needed                    |
| **G5** | **`ZenYoda3` is a shared identity.** Nitro-the-operator and his agent swarm commit as the same GitHub user, so **no ownership rule is mechanically attributable to a person.** | structural                                                     | Unchanged                                                                                                                                           | Structural. Do not "fix" in agents. Decide deliberately: a separate machine account for the swarm, or accept that authorship is not evidence |

## Why G5 is the one worth thinking about

G1–G4 are settings. G5 is not.

Every ownership rule in this repo — the class matrix, the lane split, the human locks — assumes you can tell who did something. On the git record you cannot: 692 of the last 877 commits are authored `Nitro`, and Nitro does not type git commands. That means the entire coordination layer is enforcing a distinction the machine cannot see.

This does not need fixing today, and a machine account has its own costs. But it should be a decision rather than an accident, because it silently sets the ceiling on how much any ownership rule can ever be worth.

## Related

- `docs/NITRO-DENON-OPS-REDESIGN-AUDIT-2026-08-07.md` §7 Rule 2 — why enforcing the money boundary in GitHub replaces the largest body of prose law.
- `tooling/scripts/setup-github.mjs` — exists, needs admin.
