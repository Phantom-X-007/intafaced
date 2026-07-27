# Graph-run floor — start here (other chat)

**You may start graph-engineering work from this floor.** Do not re-derive main status from stale STATUS text or chat memory.

**Snapshot:** 2026-07-27 · main tip **`7f8beec`** (protocol #37; pay #39 and all of #31–#40 on main).

---

## What is true on main

- **0 open PRs** for the service stack Denon shipped (trade, audit, p2p, agents, bank, blueprint, protocol, brand-scan, pay, handover).
- **Services on main:** identity, ledger, token, matching, trade, pay, p2p, bank, blueprint, agents, protocol (+ apps web/admin, shared packages).
- **Not a running product:** routers are **not mounted**; there is no live API plane. Code + tests only.
- Handover that said “9 open PRs” is **obsolete** — use [`STATUS-2026-07-27.md`](STATUS-2026-07-27.md).

---

## Open product work (not graph research)

| Item | State |
| ---- | ----- |
| **P0-1** mount routers | Open — gate to anything live |
| **P0-3** purpose-keyed holds | Deferred; Nitro decision card |
| **P0-2** trade order store SoT | Accepted ADR (practice already in #31) |
| Phase 2 claims | e.g. convert / terminal / venue — via tracker when claimed |

Decision card: [`decisions/P0-3-purpose-keyed-holds.md`](decisions/P0-3-purpose-keyed-holds.md)  
ADR: [`adr/2026-07-27-trade-order-store-source-of-truth.md`](adr/2026-07-27-trade-order-store-source-of-truth.md)

---

## Law vs research

| Kind | Where | Treat as |
| ---- | ----- | -------- |
| **Law** | `INTAFACED_DEFINITIVE_BUILD.md`, `AGENTS.md`, `tooling/agent-protocol/AGENT_PROTOCOL.md`, accepted ADRs | Binding |
| **Orientation** | `docs/START-HERE.md`, this file, `docs/STATUS-2026-07-27.md` | Current floor |
| **Research / graph engineering** | Other chat + any research drafts **outside** this floor set | Do not merge into law docs from this PR; do not claim code status from research notes |

This floor PR does **not** expand graph research. It only clears false main-state so the other chat does not build on poison.

---

## Hazards

- **svc-ledger tests** can `TRUNCATE` shared `ledger.*` — parallel worktrees collide. Isolation fix: **PR #42** (`fix/ledger-test-isolation`). Do not treat phantom insufficient-funds as product truth until #42 is on main.
- **Vercel MCP** needs human browser auth if you use it.
- **Never work in main checkout** — worktree + branch + PR.

---

## Parallel work already claimed

| Track | Claim |
| ----- | ----- |
| **This floor** | STATUS + ADR P0-2 + P0-3 decision + START-HERE “where we are” + this file |
| **Ledger test isolation** | [PR #42](https://github.com/Phantom-X-007/intafaced/pull/42) — unique schema / `createTestDb` for svc-ledger |

Do not open a second “refresh STATUS after merge” docs PR unless main tip or open-PR reality changes again.

---

## Minimal preflight for the graph chat

```bash
git rev-parse --show-toplevel && git branch --show-current
git log origin/main -1 --oneline
gh pr list --state open --limit 10
```

Then proceed with graph-engineering path work against **true main**, not against the pre-merge handover.
