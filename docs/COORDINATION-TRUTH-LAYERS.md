# Coordination truth layers (binding)

**Status:** BINDING · **program FINISHED** · **auto-load enforced** (no Nitro paste)  
**Home for this fact:** this file. Pointers only elsewhere.  
**Finish audit:** [`COORDINATION-FINISH-AUDIT-2026-08-02.md`](COORDINATION-FINISH-AUDIT-2026-08-02.md) (F1–F10).  
**User-claim stress test:** [`COORDINATION-STRESS-TEST-USER-CLAIMS-2026-08-02.md`](COORDINATION-STRESS-TEST-USER-CLAIMS-2026-08-02.md).  
**Intent:** Denon multi-dev context + zero agent conflict **without** slowing parallel autonomous ship.  
**Not:** a new project board, every-PR registry tax, or a human Approve gate.

### How this is enforced without you messaging a chat

| Layer                     | What loads                                           | What it does                                                      |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| **Cold agent opens repo** | `AGENTS.md` + `CLAUDE.md` (tools auto-inject)        | Coordination section + CLAUDE non-negotiable #5 — **no paste**    |
| **Hard bans**             | `tooling/agent-protocol/AGENT_PROTOCOL.md`           | Reject human-mountain implement / no-claim dual-build / fake done |
| **Machine regression**    | `pnpm scan:agent-autoload` in **CI + `pnpm verify`** | Fails if someone deletes the law from auto-load files             |
| **Tracker honesty**       | `pnpm tracker:check` in CI + verify                  | Blocks false `done` / stale render — not every craft edit         |

**Honest limit:** no tool can force a model to _think_; we put the law where tools **always load** and **block regression**. We do **not** demand `features.mjs` on every code PR (that would limit you).

---

## Operator guarantees (do not violate)

| Guarantee             | Meaning                                                                          |
| --------------------- | -------------------------------------------------------------------------------- |
| **Speed**             | No PR cap · no serialize-agents · no “wait for CI idle” · thrift stays           |
| **Quality**           | False `done` still fails `pnpm tracker:check` · doctrine gates unchanged         |
| **Autonomy**          | Agents claim, ship, merge under Class matrix — **no new Denon/Nitro Approve**    |
| **Zero Nitro manual** | Agents own claim + registry + LIVE-LANES + PR loop                               |
| **No every-PR tax**   | Craft under an already-`wip` mountain does **not** require a `features.mjs` edit |

If a future change breaks a row above, **reject the change**.

---

## One question → one home

| Question                                                      | Home                                               | Not home                        |
| ------------------------------------------------------------- | -------------------------------------------------- | ------------------------------- |
| What product features exist? free / wip / done / human-owned? | `tooling/tracker/features.mjs` → `docs/TRACKER.md` | Board Clear NEXT alone          |
| What should **this campaign** ship **next**?                  | `docs/BOARD-CLEAR-NEXT.md`                         | Tracker (not a micro-scheduler) |
| Campaign row progress / Done bars in flight?                  | `docs/BOARD-CLEAR-SCOREBOARD.md`                   | Chat memory                     |
| Who is coding **which program/paths this hour**?              | `docs/LIVE-LANES.md` + open PRs                    | Tracker WIP forever             |
| Do two live PRs collide on paths?                             | `gh pr list` + path intersect (PARALLEL law)       | Hope                            |
| What code is on main?                                         | `git` / merged PRs                                 | Any doc’s frozen SHA            |

**Conflict rule**

- **Product ownership / human lock / free-to-start** → **features.mjs wins** (with ownership law + LIVE-LANES H-\*).
- **Campaign micro-sequence (“do this next”)** → **NEXT wins** for ordering only — it **cannot** erase tracker ownership or invent free work on human mountains.
- **Code existence** → **git wins** always.

---

## When to touch the product tracker (`features.mjs`)

### Required mountain events (same PR as the event)

| Event                                 | What agents write                                                           |
| ------------------------------------- | --------------------------------------------------------------------------- |
| **Claim** a free feature              | `owner` + `status: 'wip'` · `pnpm tracker` · commit registry + `TRACKER.md` |
| **Handoff / human lock**              | `owner` (e.g. shehzad002) · note why agents babysit only                    |
| **Done** (constitution / DoD bar met) | `status: 'done'` + `requires` paths that exist · `pnpm tracker`             |
| **Cut**                               | §13 socket + honest note · not fake done                                    |
| **Wave note (optional)**              | After a merge wave that materially moves a mountain — refresh `note` once   |

### Explicitly **not** required

- Every craft / a11y / polish PR under an already-claimed `wip` row
- Pure docs / thrift docs-only PRs that do not change product ownership
- Path refactors that do not change feature meaning

**Denon intent (plain):** main’s product map must not _lie_ about ownership and free work. That is **not** “maximize `features.mjs` diffs.”

---

## Session claim (LIVE-LANES) — still mandatory before code

1. Read `docs/LIVE-LANES.md`
2. First claimer wins program/session label
3. Path-intersect open PRs before ship (`docs/BOARD-CLEAR-PARALLEL-SESSIONS.md`)
4. Free the lane when stop/merge

This prevents **dual-build**. Tracker prevents **wrong-mountain** and **false free**. Both stay — neither replaces the other.

---

## Agent cold-start (≤2 minutes)

```
git fetch origin main && git log origin/main -1 --oneline
gh pr list --state open
# machine board (generated — do not hand-edit):
pnpm swarm:freeze && pnpm swarm:status && pnpm swarm:lanes
# product free / locks:
pnpm tracker ready   # or read tooling/tracker/features.mjs owners
# session:
docs/LIVE-LANES.md
# campaign next only if Board Clear active:
docs/BOARD-CLEAR-NEXT.md
# human-only blockers (append-only inbox — refresh, do not invent a second file):
docs/BOARD-CLEAR-HUMAN-BLOCKERS.md
```

**Resume home:** `docs/ops/FREEZE-LIVE.md` (from `pnpm swarm:freeze`) — not a separate RESUME.md.  
**Cost line:** `swarm:status` prints Actions runs last 24h; if Docs-format dominates, thrift before more stamp PRs.  
**F-STANDBY:** when freeProduct=0, idling is valid; only P1–P5 with Board-Delta. Law: `docs/ops/SWARM-MANDATE.md`.  
**Value gate:** `tooling/ci/value-gate.mjs` (Docs format workflow) + L0 in `docs/BOARD-CLEAR-PROCESS-LOOPS.md`.

If tracker owner is **shehzad002** (Protocol Plane / INTACHAIN) or LIVE-LANES human chain claim → **babysit only**, never implement. Pay/bank reclaimed for agents after #346 handoff.

---

## Hard rejects (do not “improve” into these)

1. Required human review / CODEOWNERS-Approve on all agent paths
2. Cap on parallel agents or open PRs for “coordination”
3. CI rule: any code path change requires `features.mjs` diff
4. New external PM board as second product SoT
5. Making Nitro update claims by hand
6. Collapsing LIVE-LANES into features.mjs (hour-scale into product-scale)
7. Using NEXT as the only map and ignoring tracker ownership

---

## Related

- Plan + anti-list: [`TRACKER-COORDINATION-PROPER-PLAN-2026-08-02.md`](TRACKER-COORDINATION-PROPER-PLAN-2026-08-02.md)
- Evidence: [`DENON-TRACKER-TRUTH-AUDIT-2026-08-02.md`](DENON-TRACKER-TRUTH-AUDIT-2026-08-02.md)
- Claim how-to: `CONTRIBUTING.md` §3.5 · `AGENTS.md`
- Thrift: [`GITHUB-CI-SPEND-CONTROL-2026-07-31.md`](GITHUB-CI-SPEND-CONTROL-2026-07-31.md) (unchanged)
