# Order-route program — Nitro index + cold-agent handoff

**Status:** AGENT FINISH GATE · BUILD LIVE · spines F1–F7 + fast-check + door-kill wired · seed/F8 residual  
**One screen for Nitro.** Full paste for new Build chats is at the bottom.

| #   | Doc                                                                              | Role                                                |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | [Frame + method](ORDER-ROUTE-FRAME-AND-PLANNING-METHODOLOGY-2026-07-31.md)       | How we run (loop, adversarial, builder ≠ grader)    |
| 2   | [Tools landscape **v2**](ORDER-ROUTE-TOOLS-WORKFLOWS-LANDSCAPE-v2-2026-07-31.md) | last30days + star-ranked repos · Tier A/B/C         |
| 3   | [Spec v1](ORDER-ROUTE-SPEC-v1-2026-07-31.md)                                     | Checkable **REQ-IDs** (SoT for “what must be true”) |
| 4   | [Architect](ORDER-ROUTE-ARCHITECT-2026-07-31.md)                                 | Dual-book door-kill · chaos harness · seed flag     |
| 5   | [**Plan**](ORDER-ROUTE-PLAN-2026-07-31.md)                                       | Task graph P0–P8 — **execute from here**            |
| 6   | [Scoreboard](ORDER-ROUTE-READINESS-SCOREBOARD.md)                                | Living green/red                                    |
| 7   | [Domain inventory](ORDER-ROUTE-HARDEN-PROGRAM-2026-07-31.md)                     | Terrain only — **not** the plan                     |
| 8   | [**Prod-claim agent-max (path C)**](ORDER-ROUTE-PROD-CLAIM-AGENT-MAX-2026-08-02.md) | Self-prompt · L3/L4 Spec · compact resume        |
| 9   | [Human X production claim](ORDER-ROUTE-HUMAN-X-PRODUCTION-CLAIM-2026-08-02.md)   | Nitro-only go-live checklist                        |

**v1 landscape file** (historical): `ORDER-ROUTE-TOOLS-WORKFLOWS-LANDSCAPE-2026-07-31.md` — prefer **v2**.

---

## Phase now (re-derive tip before acting)

| Phase                                          | Status                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Frame · Spec · Landscape v2 · Architect · Plan | **Done** (this pack)                                                                         |
| P0-1 Denon DIRECTION #272                      | **Done on main**                                                                             |
| P0-2 LIVE-LANES claim                          | **LIVE** this ship                                                                           |
| P0-3 residual seed-first pointer               | **Done** this ship                                                                           |
| P1-1 chaos F1–F4                               | **Green on CI** (#289 Tests)                                                                 |
| P1-2 fast-check                                | **Landed** (`order-route-properties.test.ts`)                                                |
| P1-3 assemble smoke                            | **Landed** (`pnpm order-path-smoke` honest skip)                                             |
| P1-4 F5–F7                                     | **Landed** · F8 waits seed (P4)                                                              |
| Dual-book P2-1…P2-4                            | **Inventory + mutator no-op + scans + Spring door interceptor** · entity setBalance residual |
| P1-5 reconcile CX-9                            | **Landed** (`reconcileOrder`)                                                                |
| Next                                           | P3 DEX residual · P4 seed honesty (unlocks F8) · non-HTTP dual-book residual · P2-5 ADR      |

**Engine order (Denon law):** seed/mm → multi-asset → futures. Futures recipes/REST on tip ≠ “futures first” for this program.

---

## Finish gate

See [`ORDER-ROUTE-PROGRAM-FINISH-2026-07-31.md`](ORDER-ROUTE-PROGRAM-FINISH-2026-07-31.md).

## Paste into every new Build chat (verbatim)

```
Project: INTAFACED Sovereign OS (Phantom-X-007/intafaced).

WHO I AM
- Nitro (@ZenYoda3). High-level only. Infer unspoken needs. Plain language.
- I do NOT restate specs. You own quality, completeness, git/PR/verify.
- No git homework for me. Operator mode: worktree → implement → verify → PR when shipping.

PROGRAM (do not reinvent Frame/Spec)
- Index: docs/ORDER-ROUTE-PROGRAM-INDEX.md
- EXECUTE: docs/ORDER-ROUTE-PLAN-2026-07-31.md
- Contract: docs/ORDER-ROUTE-SPEC-v1-2026-07-31.md (every PR lists REQ-IDs)
- Seams: docs/ORDER-ROUTE-ARCHITECT-2026-07-31.md
- Tools: docs/ORDER-ROUTE-TOOLS-WORKFLOWS-LANDSCAPE-v2-2026-07-31.md (Tier A first)
- Scoreboard: docs/ORDER-ROUTE-READINESS-SCOREBOARD.md (update after ships)
- Domain only: docs/ORDER-ROUTE-HARDEN-PROGRAM-2026-07-31.md

ORIENT (60s) then BUILD
1. git fetch; tip = origin/main; NEVER implement on main checkout — pnpm wt or worktree.
2. export GH_TOKEN from ~/.grok/agent-auth/github_token (never print).
3. Read INDEX + Plan § Build start order. Claim LIVE-LANES order-route-harden.
4. Start remaining P0 then P1-0 guard then P1-1 chaos F1–F4 spine.
5. Class M: self-audit + fresh adversarial; Denon carve-outs (external value, scopes, new ledger recipes, posture/kill/custody) — do not silent-merge.
6. pnpm verify (or scoped + document) green before push. CI thrift: no push storms.
7. Builder never grades self — fresh Verify for money ships.
8. No go-live claim. No futures engine invent as program lead. No fake tracker done.

GO ALL OUT
- Complete named boards; empty queue → rebuild; hours of progress not 30m theater.
- Surprise by rigor (chaos + dual-book enforce + seed honesty), not feature invent.
- Dual-book: door-kill + Java scans (Architect Seam A). Chaos: in-process first (Seam B).

When done with a slice: PR link + scoreboard row + real verify output. Phase only for me.
```

---

## Cold-agent anti-drift rules

1. **Do not re-research Frame** unless Spec is proven wrong against tip.
2. **Plan is SoT for task order** — Spec is SoT for acceptance.
3. **Tier A tools only** until blocked (landscape v2).
4. If git disagrees with any doc SHA list → **git wins**; fix scoreboard same turn.
5. Stream A shell PRs: do not steal; coord LIVE-LANES.

---

## Changelog

| When       | What                                                        |
| ---------- | ----------------------------------------------------------- |
| 2026-07-31 | Initial index + paste                                       |
| 2026-07-31 | Handoff hardened for new Build chat · compaction-safe       |
| 2026-07-31 | Build ship: P0 claim · chaos F1–F4 · dual-book mutator scan |
