# R07 — living night board (do not treat as kill switch)

**Tip:** `c6d9e89e` — docs(ops): TRK research pack 2 — tip re-freeze + blueprint.card (#486)  
**When:** 2026-08-03T13:43:00Z  
**freeProduct:** 0 · **freeTracker:** 0 · **blocked:** P-WS-REPORT only  
**Open PRs:** 15 (Denon **13** · Nitro agents open · Shehzad **1** #346)  
**Proof:** NO-FLEET · Docker no  
**Schedulers:** every **30m** + **45m** keep-alive

## Mandate

Shell **freeProduct=0** is shell craft drained — **not** whole-platform done. Tracker free is **not** product spawn fuel (research/spec first unless DoD tiny). Night pivots: partner babysit (no dual-edit), integrity report when unblocked, Class N merge of green docs, re-freeze each cycle.

## Free Coord-OPS (not product craft)

| id                 | action                                                                             |
| ------------------ | ---------------------------------------------------------------------------------- |
| **BABYSIT-MATRIX** | Comment/CI only on partner open PRs — Shehzad #346 + Denon wave — **no implement** |
| **REPORTS**        | `pnpm swarm:freeze` / `swarm:report` → refresh R00–R02 + this board                |

## Blocked (do not implement)

| id              | why                                                 |
| --------------- | --------------------------------------------------- |
| **P-WS-REPORT** | Path collide Denon #433/#432/#424 (matching + edge) |

## Night PRs #473–#486+ (merged this night)

|    # | title                                                           | state            |
| ---: | --------------------------------------------------------------- | ---------------- |
|  473 | fix(format): main was red on Prettier                           | MERGED           |
|  474 | docs(ops): night engine keep-alive law                          | MERGED           |
|  475 | docs(ops): P-WS integrity report (/ws→/stream + market-ID)      | MERGED           |
|  476 | docs(ops): night TRK research pack 1                            | MERGED           |
|  477 | docs(ops): AFK invent re-scan after shell wave #462-#472        | MERGED           |
|  478 | docs(ops): P-WS integrity report 2026-08-03                     | MERGED           |
|  479 | docs(ops): night-engine Coord-OPS cycle — R07 + freeze          | MERGED           |
|  480 | docs(ops): TRK research packs — notifications, i18n, admin      | MERGED           |
|  481 | chore(swarm): harden P1–P6 merge gate, hints, claim, mandate    | MERGED           |
|  482 | docs(ops): R07 night-engine cycle2 — session merge board        | MERGED           |
|  483 | docs(ops): residual-own R-425 — shell-i18n-scan on main         | MERGED           |
|  484 | docs(ops): AFK-RESCAN invent re-scan post shell wave            | MERGED           |
|  485 | docs(ops): upgrade R-P-WS-INTEGRITY (tip SHA + citations)       | MERGED           |
|  486 | docs(ops): TRK research pack 2 — tip re-freeze + blueprint.card | MERGED (tip)     |
| 487+ | R01 babysit matrix · TRK pack 4 · this R07 refresh              | OPEN / in flight |

## Partner babysit (no dual-edit)

- **#346** @shehzad002 · `feat/pay-os-m1-gateway` · **CONFLICTING** — one-line status only; owner rebase
- **Denon open:** 13 PRs (#448 #445 #441 #438 #436 #433 #432 #430 #428 #427 #424 #422 #420) — CI/comment only; he merges on green + self-audit

## Re-derive each cycle

```bash
git fetch && git log -1 --oneline origin/main
node tooling/scripts/swarm.mjs freeze
node tooling/scripts/swarm.mjs report
gh pr list --state open
```
