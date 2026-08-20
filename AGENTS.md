# Instructions for AI agents

INTAFACED monorepo. Doctrine: [`INTAFACED_DEFINITIVE_BUILD.md`](INTAFACED_DEFINITIVE_BUILD.md). Bans: [`tooling/agent-protocol/AGENT_PROTOCOL.md`](tooling/agent-protocol/AGENT_PROTOCOL.md).

| Human                        | Role                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Nitro** (`@ZenYoda3`)      | Operator. Does not run git. Class X only (secrets, prod go-live, licences, paid external audit budget).                            |
| **Denon** (`@Phantom-X-007`) | Admin. Spine law. Ships product. Merges his own green PRs.                                                                         |
| **Shehzad** (`@shehzad002`)  | Protocol Plane + INTACHAIN only. Merges his own green PRs. Other agents do **not** implement chain/bridge/launch/dex self-custody. |

Build the product. Do not spend the session writing boards, ADRs, LIVE-LANES, START-HERE, or TRACKER recooks.

## Hard stops

1. Never move value outside `packages/ledger-client`. No module holds a balance.
2. Never store money in a `number`. Decimal strings on the wire, scaled bigint in memory.
3. Work in a worktree (`pnpm wt <branch>`), never the main checkout, never bare `git worktree add`.
4. One service per PR. Never push `main`.
5. Do not rebuild the product SPA or a **second money book**. Prefer shell + ledger + `svc-*`. **Internet leverage law:** [`docs/INTERNET-LEVERAGE-LAW.md`](docs/INTERNET-LEVERAGE-LAW.md).
6. Class X is human. Do not invent §8 owner numbers. Do not flip `audited:true`.

## Do not ping Nitro

- Denon and Shehzad squash-merge their own PRs when CI is green + self-audit. Nitro agents merge Class N/P/M when gates pass. **Never wait for a Nitro Approve.**
- `audited:true` is a paid external-audit **sale flag**. The pipeline already refuses a fake badge. **Leave it false. Keep shipping. Do not ping Nitro** to “make audit true”.
- CI red: open the **named failing job**, fix that, re-push. Do not stop the session. Do not ask Nitro.

## Stamp mill

Near-duplicate unwired series: CI warns, then blocks on the fourth. If the series is genuinely right, add a commit trailer `Serial-Work: <why>`. Coordination-only PRs (status, keepalive, board unchanged) are still forbidden.

## Coordination (no paste)

[`docs/COORDINATION-TRUTH-LAYERS.md`](docs/COORDINATION-TRUTH-LAYERS.md) — free/owner/done = `tooling/tracker/features.mjs`. Tracker touch = **mountain events** only. No PR cap. No extra Approves.

Nitro swarm coordinator only: [`docs/ops/SWARM-MANDATE.md`](docs/ops/SWARM-MANDATE.md) + [`docs/ops/FINISH-ONTOLOGY.md`](docs/ops/FINISH-ONTOLOGY.md). Optional run memory: `pnpm ledger` (if it prints `RESUME HERE`, finish those rows).

## Loop

1. Claim the mountain if it is free (Shehzad: his board id `S-*`; do not wait on Nitro-gated sockets).
2. Implement. `pnpm verify` — report what it printed. INCOMPLETE (no Docker) is not full green.
3. Self-audit money paths. Merge when the Class matrix allows. Never Class X.

Repo law beats installed skills.

## Seven rejects

1. SQL against another service’s tables.
2. Value outside `ledger-client`.
3. A balance in your service.
4. Money in a `number`.
5. Partner/vendor names in user-facing copy.
6. “Temporary” without a §13 socket.
7. Second SPA / second book / invented live prices.

GitHub (sandboxed): `GH_TOKEN` from `~/.grok/agent-auth/github_token`. Never print it.
