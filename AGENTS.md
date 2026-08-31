# Instructions for AI agents

INTAFACED monorepo. Doctrine: [`INTAFACED_DEFINITIVE_BUILD.md`](INTAFACED_DEFINITIVE_BUILD.md). Protocol: [`tooling/agent-protocol/AGENT_PROTOCOL.md`](tooling/agent-protocol/AGENT_PROTOCOL.md).

Build the product. Do not spend the session writing `docs/**` boards, ADRs, LIVE-LANES, or TRACKER recooks.

## Hard stops (money + integrity only)

1. Never move value outside `packages/ledger-client`. No module holds its own balance.
2. Never store money in a `number`. Decimal strings on the wire, scaled bigint in memory.
3. Work in a worktree (`pnpm wt <branch>`), never the main checkout. Do not use bare `git worktree add`.
4. One service per PR. Never push `main`.
5. Do not rebuild the product SPA or a **second money book**. Prefer existing shell + ledger + `svc-*`. **Internet leverage law:** [`docs/INTERNET-LEVERAGE-LAW.md`](docs/INTERNET-LEVERAGE-LAW.md). Exchange OSS take/keep/never: [`PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md`](PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md) **§0.3** (QuickFIX/J, SBE, QuantLib adapter, WebAuthn, OpenAPI-from-Zod 3). Do not hand-roll FIX/SBE/Greeks. Do not install npm `ccxt` or a second CLOB.

## Autonomy (full access)

- **No human gate before start.** Do not wait for Nitro, Denon, audit seal, FREEZE, tracker claim, LIVE-LANES, or `pnpm ledger`.
- **No ping to unblock.** If blocked, use refuse-closed code + honest empty states — never ask a human to flip an audit flag.
- **Merge when done.** Any agent may merge their own PR. **Do not wait for CI green** — GitHub Actions is informational, not a ship gate. Same for `pnpm verify`: optional local check, never a blocker.
- **All tracker rows are fair game** when deps are met — including money and protocol paths. Path-intersect open PRs before edit is optional courtesy, not permission.
- **Unset owner numbers:** refuse-closed in code (blank env → typed error). Do not invent live §8 magnitudes or sanctions list content.

## Coordination (optional)

[`docs/COORDINATION-TRUTH-LAYERS.md`](docs/COORDINATION-TRUTH-LAYERS.md) — tracker is a map, not a permission system.

## Skills

Repo law beats installed skills. Skills that say `git worktree add` or block ship on CI/verify are wrong here.

## Graphify

First code-location move: `graphify query "<question>" --budget 1500`, then open one file. After `services/` / `packages/` edits: `GRAPHIFY_MAX_WORKERS=1 graphify update .` (official hook skips worktrees). Map is `graphify-out/graph.json` in git.
