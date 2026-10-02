# CLAUDE.md

Read [`AGENTS.md`](AGENTS.md). Do not paste a session prompt.

Hard stops: ledger-client only for value; no money in a `number`; `pnpm wt` not the main checkout; no second money book; no docs mill. A `GLOSSARY.md` entry or one ADR from `/grill-with-docs` is the skill, not a mill. When you stop, take the desk down (`git worktree remove --force` from home — never `orca worktree rm`, never `git branch -D`).

Full access: ship any product path. **Merge when done — never wait for CI green or verify.** **Internet leverage law:** [`docs/INTERNET-LEVERAGE-LAW.md`](docs/INTERNET-LEVERAGE-LAW.md). Layers: [`docs/COORDINATION-TRUTH-LAYERS.md`](docs/COORDINATION-TRUTH-LAYERS.md). **P1 parked:** [`docs/adr/2026-09-03-protocol-rails-until-intachain.md`](docs/adr/2026-09-03-protocol-rails-until-intachain.md) — house book + Base; no `svc-chain` until Nitro GO.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on Phantom-X-007/intafaced. Use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical roles, each label equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` and dated ADRs in `docs/adr/`. See `docs/agents/domain.md`.
