# Instructions for AI agents

INTAFACED monorepo. Doctrine: [`INTAFACED_DEFINITIVE_BUILD.md`](INTAFACED_DEFINITIVE_BUILD.md). Protocol: [`tooling/agent-protocol/AGENT_PROTOCOL.md`](tooling/agent-protocol/AGENT_PROTOCOL.md).

| Human                        | Role                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| **Nitro** (`@ZenYoda3`)      | Operator. Does not run git by hand.                                                   |
| **Denon** (`@Phantom-X-007`) | Admin. Ships product. Directs spine law.                                              |
| **Shehzad** (`@shehzad002`)  | Protocol + INTACHAIN only. Do **not** implement chain/bridge/launch/dex self-custody. |

Build the product. Do not spend the session writing `docs/**` boards, ADRs, LIVE-LANES, START-HERE, or TRACKER recooks.

## Hard stops (money + custody)

1. Never move value outside `packages/ledger-client`. No module holds its own balance.
2. Never store money in a `number`. Decimal strings on the wire, scaled bigint in memory.
3. Work in a worktree (`pnpm wt <branch>`), never the main checkout. Do not use bare `git worktree add`.
4. Run `pnpm verify` before claiming done. Report what it printed.
5. One service per PR. Never push `main`.
6. Do not rebuild the product SPA or a **second money book**. Prefer existing shell + ledger + `svc-*`. Law: [`docs/INTERNET-LEVERAGE-LAW.md`](docs/INTERNET-LEVERAGE-LAW.md) (**Internet leverage law**).
7. Class X (secrets, prod go-live, licence, sanctions content) is human. Do not invent §8 owner numbers.

## Coordination (no paste)

[`docs/COORDINATION-TRUTH-LAYERS.md`](docs/COORDINATION-TRUTH-LAYERS.md) — product free/owner/done = `tooling/tracker/features.mjs`. Tracker touch = **mountain events** only. No PR cap. No extra Approves.

Optional run memory (gitignored): `pnpm ledger`. If it prints `RESUME HERE`, finish those rows. `pnpm ledger open-count` is the run-level check.

## Merge

Denon merges when CI is green. Nitro agents merge Class N/P/M when gates pass. Never wait for a mutual Approve. Never merge Class X as agent-done.

## Skills

Repo law beats installed skills. Skills that say `git worktree add` or a completion check other than `pnpm verify` are wrong here.
