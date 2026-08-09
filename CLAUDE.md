# CLAUDE.md

Read [`AGENTS.md`](AGENTS.md) first — it is the canonical brief for every AI agent on this repo.  
**Nitro does not paste this.** Opening the repo is enough: you load this file → AGENTS.md → multi-dev law.

Plain-language map for Nitro: [`docs/START-HERE.md`](docs/START-HERE.md).  
Optional paste (not required for enforcement): [`docs/NITRO-SESSION-PROMPT.md`](docs/NITRO-SESSION-PROMPT.md).  
Ownership law (Nitro executes + merges · Denon directs): [`docs/NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md`](docs/NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md).  
**Multi-dev / tracker / claims (no paste):** [`docs/COORDINATION-TRUTH-LAYERS.md`](docs/COORDINATION-TRUTH-LAYERS.md) — product free/owner/done = `features.mjs`; session dual-build = LIVE-LANES; campaign next ≠ ownership. Mountain events only. No PR caps / no new Approves.

The non-negotiables (money + process), repeated because they cost real money or real multi-dev chaos:

1. **Never work in the main checkout.** Run `git rev-parse --show-toplevel` before your first edit. If it is the main checkout, **create a worktree** (`pnpm wt <branch>`) and continue there — do not hand Nitro a git homework list (see Nitro operator mode in `AGENTS.md`).
2. **Never move value outside `packages/ledger-client`.** Doctrine §0.6 — no module holds its own balance.
3. **Never store money in a `number`.** Decimal strings on the wire, scaled bigint in memory.
4. **Run `pnpm verify` before claiming done**, and report what it actually printed.
5. **Multi-dev claim law (automatic — do not wait for Nitro to remind you):** before code, LIVE-LANES + tracker free/owner check; never implement Shehzad chain mountains (protocol/INTACHAIN; tracker owner shehzad002); on mountain claim/handoff/done update `features.mjs` (not every craft PR). Home: `docs/COORDINATION-TRUTH-LAYERS.md`.
6. **Internet leverage law (automatic):** before product code, load [`docs/INTERNET-LEVERAGE-LAW.md`](docs/INTERNET-LEVERAGE-LAW.md) + Phase A audit — prefer vendor shell + ledger + existing `svc-*`; do **not** rebuild the product SPA or second book; do **not** ask Nitro for a leverage pick list. Residual paths: full-horizon map.
7. **Repo law beats any installed skill or generic playbook.** Globally installed agent skills are advice; this file and `AGENTS.md` are law. Where they disagree, the repo wins and you do not need to ask. Three known collisions, each of which produces a real failure:
   - a skill prescribing `git worktree add` instead of **`pnpm wt <branch>`** — `pnpm wt` is _create + install + copy `.env` + enforce the branch-name convention_, so a bare `git worktree add` leaves a worktree with no `node_modules`, where suites fail to **collect** and read as failures when nothing is actually failing;
   - a skill prescribing its own completion check instead of **`pnpm verify`** (non-negotiable 4);
   - a skill claiming it applies "before ANY response" — nothing preempts this file.

   Skills stay installed because they are useful elsewhere; the fix is precedence, not removal. **A generic skill nudging you toward `git worktree add` is exactly how Nitro ends up with the git homework list `AGENTS.md` exists to prevent.**

The law is [`INTAFACED_DEFINITIVE_BUILD.md`](INTAFACED_DEFINITIVE_BUILD.md). The rules are [`tooling/agent-protocol/AGENT_PROTOCOL.md`](tooling/agent-protocol/AGENT_PROTOCOL.md). On ambiguity, the doctrine (§0) decides; if it does not, stop and ask.
