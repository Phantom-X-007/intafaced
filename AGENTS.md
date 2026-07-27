# Instructions for AI agents

You are working in the INTAFACED monorepo. Read this before your first edit.

## Read these, in order

1. [`INTAFACED_DEFINITIVE_BUILD.md`](INTAFACED_DEFINITIVE_BUILD.md) — the law. Not background context; the actual specification, including the doctrines (§0) that decide ambiguity.
2. [`tooling/agent-protocol/AGENT_PROTOCOL.md`](tooling/agent-protocol/AGENT_PROTOCOL.md) — the rules for changing code, including the hard prohibitions table.
3. The target service's `README.md`.
4. [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch, PR, and worktree workflow.

## Check where you are, first

```bash
git rev-parse --show-toplevel && git branch --show-current
```

**If you are in the main checkout, stop.** Ask the human to run `pnpm wt <branch>` and reopen you in the worktree. Two agents editing one working directory is how a day gets lost.

## The six that get a PR rejected

1. Writing SQL against another service's tables. Use `packages/contracts` (tRPC) or `packages/events` (NATS).
2. Moving value outside `packages/ledger-client`. Add a recipe instead.
3. Holding a balance in your service. The ledger holds balances; you hold an account id.
4. Storing money in a `number`. Decimal strings on the wire, scaled bigint in memory, `numeric(38,18)` in Postgres.
5. Naming a partner or model vendor in user-facing copy. `pnpm scan:brand` fails the build.
6. Leaving anything "temporary" without a §13 socket entry.

## Before you say you are done

```bash
pnpm verify    # build · typecheck · test · DoD gate
```

Not "it should work". Run it, and report what it actually printed. If tests fail, say so with the output.

## Scope

One service per task. If you need to change two services, the contract or event PR comes **first**, on its own — that PR _is_ the design review.

## When the spec is ambiguous

The doctrine (§0) decides. If the doctrine does not decide, **stop and ask.** Do not guess on money, custody, or jurisdiction — those three are where a wrong guess is expensive rather than annoying.
