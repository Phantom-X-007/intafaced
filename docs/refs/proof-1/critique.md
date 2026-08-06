# Critique — `proof-1` (scorecard eyes + craft flags)

**Skill used:** design-taste-frontend (lead for PROOF); B13 will re-run **impeccable** on fix PR  
**Surface:** `/exchange` desk primary; index; login; money/withdraw unauth  
**Date:** 2026-08-02  
**Orca pack:** `docs/styleboard/shots/scorecard-2026-08-02/`

## Findings (ranked)

| Sev | Finding                                                                                                                                                  | Fix this PR?                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| P0  | Chart body often pure black; empty copy (`No market feed…` / `Chart unavailable`) not reliably readable over/under widget — fails empty-calm at a glance | **N** — scorecard only; fix in B13 craft PR |
| P0  | Dim6 density = **1**: huge dead regions (chart + page footer under desk) while book/ticket already carry honesty — desk does not yet read “pro terminal” | **N** — residual B2                         |
| P1  | Unauth money/withdraw only prove gate (redirect), not receipt/lock UX — G12 re-cert incomplete for money path                                            | **N** — auth Orca later; never seed money   |
| P1  | Login form is generic crypto template (world map + card) — acceptable auth, not workbench craft                                                          | **N** — B12 later                           |
| P2  | Watchlist honesty good; when markets down rail is very thin (expected) — still needs denser structure when list returns                                  | **N** — B6 with data                        |
| P2  | Index hero “101 Years of Service” + HOT strip still marketing-shell, not workbench                                                                       | **N** — B12 last                            |

## Anti-slop

- [x] Would a stranger name a competitor from a crop? — **No** clear Binance/HL clone; shell still generic CEX vendor DNA
- [x] Glass/confetti/neon/AI-SaaS tells? — **No** confetti; solid dark panels; teal accent restrained
- [x] Honesty: failed fetch never looks rich? — **Yes** on desk book/fee/markets; chart silent black is the honesty gap

## Scorecard dims claimed

| Dim                 | Before (A0)       | After (PROOF-1) | Evidence                        |
| ------------------- | ----------------- | --------------- | ------------------------------- |
| G4 Honesty          | 2→target 3        | **pass**        | Orca 01/02 copy                 |
| G11 Feed            | 2                 | **pass\***      | book labels; chart overlay flag |
| Dim6 density        | unmeasured post-B | **1**           | 02-exchange.png void            |
| “World-class craft” | —                 | **not claimed** | residual B2/B13                 |

## Next craft (B13 handoff)

1. Chart empty overlay: higher contrast + z-index above kline host; ensure `!feedLive \|\| chartFailed` always paints a readable line.
2. Density pass: reduce footer waste under desk; tighten panel gaps (B2).
3. Optional: auth session Orca for withdraw receipt only if safe fixture exists without seeding balances.
