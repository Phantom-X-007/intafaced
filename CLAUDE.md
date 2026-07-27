# CLAUDE.md

Read [`AGENTS.md`](AGENTS.md) first — it is the canonical brief for every AI agent on this repo.

The four non-negotiables, repeated here because they are the ones that cost real money or real time:

1. **Never work in the main checkout.** Run `git rev-parse --show-toplevel` before your first edit. If it is the main checkout, stop and ask for a worktree (`pnpm wt <branch>`).
2. **Never move value outside `packages/ledger-client`.** Doctrine §0.6 — no module holds its own balance.
3. **Never store money in a `number`.** Decimal strings on the wire, scaled bigint in memory.
4. **Run `pnpm verify` before claiming done**, and report what it actually printed.

The law is [`INTAFACED_DEFINITIVE_BUILD.md`](INTAFACED_DEFINITIVE_BUILD.md). The rules are [`tooling/agent-protocol/AGENT_PROTOCOL.md`](tooling/agent-protocol/AGENT_PROTOCOL.md). On ambiguity, the doctrine (§0) decides; if it does not, stop and ask.
