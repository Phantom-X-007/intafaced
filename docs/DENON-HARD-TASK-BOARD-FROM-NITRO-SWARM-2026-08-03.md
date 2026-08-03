# Denon — hard task board (while Nitro agents swarm free shell)

**Date:** 2026-08-03  
**Tip at write:** re-derive `origin/main` (swarm freeze may lag)  
**From:** Nitro (agents parallel on free product)  
**Why this board exists:** Agents are good at **path-clean shell craft + reports + Class N merges**. They are **bad** at platform integrity, money/custody spine under open PR piles, product law, and finishing _your_ conflicting integrity PRs without dual-edit thrash.

**Re-derive before you cook:** `git fetch && git log -1 --oneline origin/main` · `gh pr list`

---

## 0 · Split (so we don’t dual-build)

### Nitro agents **will** cover (do **not** re-implement unless they fail)

| Area                       | What                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shell product residual** | RP1 Exchange → ix-money call sites · RP2 Index landing honesty · RP3 announce reason · RP4 wire golden + ix-trade adopt · RP5 terminal residual after those |
| **AFK residual craft**     | AFK-UC-COMP, IDENT, LAB, CMDK, HELP, WHITEPAPER, APPDOWNLOAD, FOOTER, RESCAN, B12/B13, META craft (path-clean)                                              |
| **Landers already merged** | #455 money module · #456 landing strings · #457 wire schemas (partials — call-site finish is agent residual)                                                |
| **Reports / freeze board** | `pnpm swarm:*` · `docs/ops/*` · claim files · Class N shell merges when green                                                                               |
| **Babysit only**           | Comment/CI on your open PRs — **no dual-edit of your open file sets**                                                                                       |

### Explicitly **not** agent free (you or Shehzad)

| Area                                                 | Why agents fail / thrash                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| Your **open integrity PR pile** (many CONFLICTING)   | Shared `features.mjs` / package.json / ci thrash; path dual-edit |
| **WS market-ID ∩ edge + `/ws`→`/stream`**            | Platform services; blocks all depth; REGROUP §3                  |
| **Money Class M under your PRs**                     | ledger schema, custody, matching reconcile, event bus            |
| **Product law** (futures/OTC/multi-asset invent)     | Ownership law — direction is yours                               |
| **Shehzad M1–M7**                                    | Human hard lock — babysit only                                   |
| **apps/web one-commit delete + compose build proof** | Needs runtime + tracker/i18n decisions you already framed        |
| **Abandon vs resume** spine crash WIP branches       | Your call                                                        |

---

## 1 · HARD board (priority — most valuable for _your_ hands)

Ranked for **unblock agents + real money integrity**, not volume theater.

### P0 — Unblocks whole product classes

| ID               | Task                                                                                                                                                                                                                                                                            | Why hard for agent swarm                                                                | Done looks like                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **D-P0-WS**      | **Platform integrity:** svc-ws ↔ svc-edge market ID namespaces intersect non-empty; nginx `:8090` has a path that reaches depth stream (`/ws` vs `/stream` / `location /` catch)                                                                                                | Agents cannot honestly ship depth/tape; REGROUP §3 is explicit platform lane            | Live shell can open depth for a real market id; handoff note on tip |
| **D-P0-MERGE**   | **Land your open integrity pile** — especially **CONFLICTING** ones: #446 events void · #445 silent test skips · #441 coverage-check · #438 workspace-sync · #436 launch flags · #432 screening · #428 p2p · #423 notify · #422 custody-scan · #420 tracker money doc as needed | Agents cannot dual-edit those files; merge queue is _your_ bottleneck, not writer count | Green merged or residual owned with rebase plan; fewer CONFLICTING  |
| **D-P0-MONEY**   | **Money spine that already has PRs:** #437 ledger schema drift (8 CHECKs) · #433 matching↔ledger reconcile / money-stranding · #422 custody scan sees Java balance writes                                                                                                       | Class M + domain judgment; thrash if agents “help” mid-PR                               | Merged with self-audit; no silent green                             |
| **D-P0-SECRETS** | **#448 secret blast-radius / parity gate** (touches brand-scan/gates — agents must not mid-edit)                                                                                                                                                                                | CI truth + dual-edit magnet                                                             | Merged; brand-scan vendor policy decided _by you_                   |

### P1 — CI / truth that agents half-own but need your judgment

| ID              | Task                                                                                                   | Why you                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **D-P1-BRAND**  | **brand-scan must see `vendor/`** (or second scan). Today skip = shell never checked for partner names | You own CI story + #448 cluster                             |
| **D-P1-I18N**   | **i18n non-vacuity** when `apps/web` dies (gates walk empty and pass forever) — REGROUP §6             | Scope decision + gate design; agents may draft but you seal |
| **D-P1-EDGE**   | **#424 edge CORS** (fine for same-origin shell; still health/readability)                              | Your edge PR — land or cut with reason                      |
| **D-P1-COV**    | **#441 / #430 coverage-check** — 40 law-specified capabilities without tracker rows                    | Direction + gate you already named                          |
| **D-P1-EVENTS** | **#446** 17/32 events published into the void                                                          | Cross-service event contracts — not shell craft             |
| **D-P1-FLAGS**  | **#436** launch flags actually gate traffic                                                            | Config/product truth                                        |
| **D-P1-SCREEN** | **#432** sanctions/region boot guard authority                                                         | Compliance-adjacent                                         |

### P2 — Product law / human spine (agents babysit only)

| ID               | Task                                                                                            | Why you                                           |
| ---------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **D-P2-LAW**     | Futures / OTC / multi-asset / copy **product law** for anything still greenfield                | Ownership law — agents must not invent            |
| **D-P2-SHEHZAD** | Unblock/coordinate **#346** pay M1 with Shehzad (not implement his mountain)                    | Human hard lock                                   |
| **D-P2-SPINE**   | **Abandon vs resume** `feat/spine-*` crash WIPs still on remote                                 | Only you can decide without destroy               |
| **D-P2-DEPTH**   | Depth/tape **after** D-P0-WS                                                                    | Port is worthless before integrity                |
| **D-P2-DELETE**  | **`apps/web` one-commit delete** when REGROUP §7 queue clear + **`docker compose build`** proof | Sequencing + image gate agents lack without fleet |

### P3 — Ops that free agent parallel later

| ID               | Task                                                                           | Why                                                       |
| ---------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **D-P3-TRACKER** | Stop multi-PR thrash on `features.mjs` / TRACKER.md (batch regenerations)      | Unblocks agent Class N merges                             |
| **D-P3-PKG**     | Open PR pile on `package.json` / gates.mjs / ci.yml — land or coordinate order | Agents batch aliases after you clear                      |
| **D-P3-FLEET**   | Container runtime story on Nitro machine / docs for proof (optional)           | Agents run NO-FLEET until then — honesty residual stamped |

---

## 2 · What the swarm is doing _right now_ (context for you)

**Coordinator session:** AFK hardened swarm — `pnpm swarm:freeze` → claim free product → spawn workers (Orca/multi-chat).

**Free product set (typical):** RP1 money call sites · RP2 Index honesty · RP3 announce · RP4 wire adopt · AFK residual ids · not AFK-INDEX if RP2 claimed · **not** depth UI · **not** your open PR paths.

**Already merged landers (partials):** #455 · #456 · #457 — agents finish **call sites / Index wire / golden adopt**, not re-build modules.

**They will not:** force-push your spine · implement Shehzad M1–M7 · invent mid/depth · dual-edit your open files · treat `apps/web` as product.

---

## 3 · Ask of you (minimal)

1. **Pick from P0 first** — especially **D-P0-WS** and **D-P0-MERGE / D-P0-MONEY**.
2. If you take a shell path agents already claimed, **say so** on LIVE-LANES/Telegram so they drop it.
3. When you land integrity PRs, agents re-freeze free set automatically next fire.

---

## 4 · Implicit requirements (why this board is shaped this way)

| Unspoken need                                | How board answers                             |
| -------------------------------------------- | --------------------------------------------- |
| Agents go all-out without blocking you       | Shell residual is theirs; hard spine is yours |
| You are not residual ship machine for craft  | Craft not on this board                       |
| Real depth/money needs judgment              | P0 WS + money PRs                             |
| Parallel thrash is expensive on shared files | You own merge of CONFLICTING pile             |
| Plan complete named set                      | P0–P3 full; nothing silent                    |

---

## 5 · One-breath message you can paste to Denon

```
Bro — Nitro agents are AFK-swarming free shell residual (Bizzan :8090): money call sites, Index honesty, wire adopt, AFK craft. They will not dual-edit your open PRs or touch Shehzad.

Need you on the hard stuff agents thrash on:
1) WS/market-ID + nginx so depth can ever work (REGROUP blocker)
2) Land/rebase your CONFLICTING integrity pile (#446 #445 #441 #438 #436 #432 #428 #423 #422 …)
3) Money Class M: #437 ledger schema, #433 engine-ledger reconcile, #422 custody Java
4) #448 secrets/gates/brand-scan vendor policy
5) Product law + spine abandon/resume + apps/web delete when queue clear

Full board: docs/DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md on tip after merge (or this paste).
Shell craft = us. Platform + money integrity + your open PRs = you.
```

---

**Tip note:** If this file is not yet on `main`, paste §5 + P0 table to Denon now; land this doc as Class N docs PR when free.
