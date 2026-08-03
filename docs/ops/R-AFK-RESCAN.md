# R-AFK-RESCAN — invent-pattern scan (Coord-OPS)

**When:** 2026-08-03 · tip `81771578` (`fix(format): main was red on Prettier…` #473)  
**Mode:** NO-FLEET · static `rg` only (no visual)  
**Scope:** `vendor/coinexchange/05_Web_Front` primary · `apps/web` + `apps/admin` honesty cross-check  
**Claim:** AFK-RESCAN residual-own  
**Trigger:** re-scan after shell wave merges **#462–#472** (plus tip #473 format)

## Method

Ripgrep for invent / fake / stub / PriceTrend / Math.random / hardcoded price-balance patterns. Distinguish **honesty law comments** (good — “never invent”) from **live invent residual** (bad).

```text
rg -n -i invent|fake|stub|PriceTrend|Math\.random  vendor/coinexchange/05_Web_Front
# plus hardcoded price/balance fallbacks (CNY 6.5, dataFanyong, || '0.00', mockTicker…)
```

## Shell wave on tip (context)

| PR    | claim / surface                         | invent relevance                         |
| ----- | --------------------------------------- | ---------------------------------------- |
| #462  | AFK-UC-COMP · MinTrade socket           | fee-rebate mining invent removed         |
| #463  | AFK-CMDK-ROUTES · ⌘K catalog            | no invented routes/markets               |
| #464  | AFK-FOOTER · marketing footer hide      | no invent social URLs (prior honesty)    |
| #465  | RP2 · Index landing honesty             | no null/green▲/fake trend                |
| #467  | RP3 · announce strip reason             | sockets / IxNoSurface (not invent strip) |
| #468  | RP1+RP4 · money-on-wire + ix-wire       | no invent fees/balances on wire          |
| #472  | RP3 residual · Index announce IxNoSurface | announce honesty                         |

## Findings

### Hit counts (static `rg`, tip `81771578`)

| pattern                         | vendor front lines | verdict                                      |
| ------------------------------- | ------------------ | -------------------------------------------- |
| `invent` (case-insensitive)     | **87**             | **all doctrine / honesty comments** (good)   |
| `\bfake\b`                      | **8**              | comments + anti-fraud copy word “fake”       |
| `PriceTrend` / `priceTrend`     | **1**              | historical note in `en.js` (column removed)  |
| `Math.random` (excl. jquery/charts) | **1** (`gt.js`) | captcha id — not market invent               |
| live `dataFanyong` / `CNYRate \|\| 6.5` / `mockTicker` | **0** | prior removals still gone                  |
| **NEW hard invent residual**    | **0**              | no invent-fix code PR from this pass         |

### No new hard invent residual

Most `invent` hits are **doctrine comments** (never invent prices, rates, FAQs, social URLs, page counts, depth, order ids). That is healthy and expected after Stream A honesty work.

Executable invent checks (hardcoded money returns, fake leaderboard identifiers, CNY 6.5 fallback still live, sparkline-of-zeros) → **absent** on this tip.

### Known residual surfaces (already owned — do not dual-edit)

| surface                            | signal after shell wave                                      | owner claim                                      |
| ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| `pages/index/Index.vue`            | honesty comments only (PriceTrend/CNY invent **removed** in #465/#472) | **RP2 MERGED** · AFK-INDEX residual-own blocked |
| `pages/exchange/Exchange.vue`      | money-on-wire / no invent fees comments (#468)               | **RP1 MERGED**                                   |
| `components/uc/MinTrade.vue`       | §13 `trade.mining` socket (#462)                             | **AFK-UC-COMP MERGED**                           |
| `pages/uc/AppDownload.vue`         | §13 invented-content case documented in header               | **AFK-APPDOWNLOAD** residual-own                 |
| `pages/uc/IdentBusiness.vue`       | form placeholders (jurisdiction etc.) — UX not money invent  | **AFK-IDENT** residual-own                       |
| `pages/cms/Help*.vue`              | honesty empty≠FAQ invent                                     | **AFK-HELP-DETAIL** residual-own                 |
| WhitePaper / BZB path              | socket / no invent PDF (cmd-palette golden asserts absence)  | **AFK-WHITEPAPER** residual-own                  |
| `App.vue` footer                   | no invent social URLs (#464)                                 | **AFK-FOOTER MERGED**                            |
| `cmd-palette` + golden             | market/route not invented (#463)                             | **AFK-CMDK-ROUTES MERGED**                       |
| `pages/intafaced/*`                | dual-book / no fake deployed badges                          | **AFK-LAB-PASS** residual-own                    |
| `components/uc/*` (empty≠zero)     | empty≠zero sweeps; MinTrade closed                           | **AFK-UC-COMP MERGED** (residual empty≠zero ok)  |

### Cross-check: `apps/web` / `apps/admin` (not Stream A shell, but invent family)

| surface                         | signal                                                          | verdict                                      |
| ------------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| `apps/web` landing + terminal   | header comments + `page.test` / fabricated-money ratchet        | honesty (prior invent **removed**)           |
| `apps/web` `Math.random`        | client order id entropy only                                    | not market invent                            |
| `apps/admin` ledger freeze path | “never invents a state” comments                                | honesty                                      |

### Noise (not product invent)

- `jquery` / `gt.js` `Math.random` — third-party / captcha id
- Input `placeholder=` form UX (e.g. IdentBusiness `GB`, Exchange `0.00` input hint) — not money invent
- `en.js` anti-fraud copy containing the word “fake”
- Golden fixtures asserting invent **mutations** (ix-money.legacy `68412…`) — tests, not UI

### Prior invent removals still documented in-file (re-verified gone)

Invite fake leaderboard (`dataFanyong`), Activity invented completion %, AppDownload hardcoded store pair, Index CNY 6.5 + zero sparkline, MinTrade yield invent — comments describe **past** invent; identifiers/fallbacks **not** present as live data on this tip.

## Action

1. **Do not open a new invent-fix PR from OPS** — **new hard invent count = 0**; residual AFK workers own remaining honesty/socket polish paths only.
2. Next re-run after another ~5 Class N shell merges (or any invent-adjacent PR pile).
3. Visual check remains stamped `proof_missing: fleet-blocked` under NO-FLEET (foreign `:8090` is invalid visual).

## Proof

```
proof_missing: fleet-blocked
scan: static-rg only
scope: vendor/coinexchange/05_Web_Front + apps/web + apps/admin cross-check
tip: 81771578
shell_wave: #462-#472 (+ tip #473)
invent_line_hits: 87 (all honesty/doctrine)
new_hard_invent_residual: 0
invent_fix_pr: none
```
