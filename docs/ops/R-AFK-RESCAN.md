# R-AFK-RESCAN — invent-pattern scan (Coord-OPS)

**When:** 2026-08-03 · tip `c773dafa` (#482 · post shell wave + post prior rescan #477)  
**Mode:** NO-FLEET · static `rg` + `tooling/ci/fabricated-money-scan.mjs` (no visual)  
**Scope:** `vendor/coinexchange/05_Web_Front` primary · `apps/web` + `apps/admin` honesty cross-check  
**Claim:** AFK-RESCAN residual-own  
**Trigger:** AFK-RESCAN invent re-scan after shell merge cluster (#462–#472) and post-#477 docs tip

## Method

```text
rg -n -i invent|fake|stub|PriceTrend|Math\.random  vendor/coinexchange/05_Web_Front
# hard invent fingerprints: dataFanyong, CNYRate||6.5, mockTicker, zero-sparkline, ||'0.00'
node tooling/ci/fabricated-money-scan.mjs
```

Distinguish **honesty law comments** (good — “never invent”) from **live invent residual** (bad).

## Shell wave on tip (context)

| PR        | claim / surface                           | invent relevance                           |
| --------- | ----------------------------------------- | ------------------------------------------ |
| #462      | AFK-UC-COMP · MinTrade socket             | fee-rebate mining invent removed           |
| #463      | AFK-CMDK-ROUTES · ⌘K catalog              | no invented routes/markets                 |
| #464      | AFK-FOOTER · marketing footer hide        | no invent social URLs (prior honesty)      |
| #465      | RP2 · Index landing honesty               | no null/green▲/fake trend                  |
| #467      | RP3 · announce strip reason               | sockets / IxNoSurface (not invent strip)   |
| #468      | RP1+RP4 · money-on-wire + ix-wire         | no invent fees/balances on wire            |
| #472      | RP3 residual · Index announce IxNoSurface | announce honesty                           |
| #477      | prior AFK-RESCAN report                   | new hard invent = 0 at `f96ac6b4`          |
| #473–#482 | format / docs / swarm chore only          | **no shell product code delta** since #477 |

`git log 8c8157ba..c773dafa -- vendor/coinexchange/05_Web_Front apps/web apps/admin` → **empty**.

## Findings

### Hit counts (static `rg`, tip `c773dafa`)

| pattern                                                | vendor front lines | verdict                                     |
| ------------------------------------------------------ | ------------------ | ------------------------------------------- |
| `invent` (case-insensitive)                            | **87**             | **all doctrine / honesty comments** (good)  |
| `\bfake\b`                                             | **8**              | comments + anti-fraud copy word “fake”      |
| `PriceTrend` / `priceTrend`                            | **1**              | historical note in `en.js` (column removed) |
| `Math.random` (excl. jquery/charts)                    | **1** (`gt.js`)    | captcha id — not market invent              |
| live `dataFanyong` / `CNYRate \|\| 6.5` / `mockTicker` | **0**              | prior removals still gone                   |
| zero-sparkline `Array(25).fill(0)`                     | **0**              | absent                                      |
| live `\|\| '0.00'` / `?? '0.'` money fallbacks         | **0**              | absent (placeholders are separate)          |
| **NEW hard invent residual**                           | **0**              | no invent-fix code PR from this pass        |

### fabricated-money-scan.mjs (gate)

```
✓ fabricated-money — 93 shell file(s), 10 finding(s), all at the frozen baseline
  ⚠ kline.js — priceScale = Math.pow(10, options.scale || 2)
  ⚠ Exchange.vue — coinScale: 6, baseCoinScale: 6, scale||2, scale==null?2, 0.00×2
  ⚠ AdPublish.vue — 0.00×3 placeholders
EXIT=0
```

Gate green: queue did **not** grow. Frozen rows are named debt, not new invent.

### No new hard invent residual

Most `invent` hits are **doctrine comments** (never invent prices, rates, FAQs, social URLs, page counts, depth, order ids). Executable invent (hardcoded money returns, fake leaderboard ids, live CNY 6.5 fallback, sparkline-of-zeros) → **absent**.

### Frozen invent debt (named residual — not “new hard invent”)

These are **checkable residual-own / residual-fix candidates** already frozen by the gate. Clear a row → delete matching BASELINE string in `tooling/ci/fabricated-money-scan.mjs`.

| #    | file                              | proof string (exact match)                        | note                                        |
| ---- | --------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| 1    | `assets/js/market-chart/kline.js` | `priceScale = Math.pow(10, options.scale \|\| 2)` | invented chart precision default            |
| 2    | `pages/exchange/Exchange.vue`     | `coinScale: 6,`                                   | data() invent place-count before instrument |
| 3    | `pages/exchange/Exchange.vue`     | `baseCoinScale: 6,`                               | same family                                 |
| 4    | `pages/exchange/Exchange.vue`     | `scale = this.baseCoinScale \|\| 2;`              | live at ~L2275                              |
| 5    | `pages/exchange/Exchange.vue`     | `scale == null ? 2 :`                             | `fmt()` fallback places                     |
| 6–7  | `pages/exchange/Exchange.vue`     | `0.00` ×2                                         | limit/market price input placeholders       |
| 8–10 | `pages/otc/AdPublish.vue`         | `0.00` ×3                                         | price / minAmount / maxAmount placeholders  |

**Do not dual-edit** Exchange under open money PRs; RP1 (#468) merged — residual polish only when free.

### Known residual surfaces (already owned — do not dual-edit)

| surface                       | signal after shell wave                                                | owner claim                                     |
| ----------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| `pages/index/Index.vue`       | honesty comments only (PriceTrend/CNY invent **removed** in #465/#472) | **RP2 MERGED** · AFK-INDEX residual-own         |
| `pages/exchange/Exchange.vue` | money-on-wire + frozen scale/placeholder debt (#468)                   | **RP1 MERGED** · baseline residual above        |
| `components/uc/MinTrade.vue`  | §13 `trade.mining` socket (#462)                                       | **AFK-UC-COMP MERGED**                          |
| `pages/uc/AppDownload.vue`    | §13 invented-content case documented in header                         | **AFK-APPDOWNLOAD** residual-own                |
| `pages/uc/IdentBusiness.vue`  | form placeholders (jurisdiction etc.) — UX not money invent            | **AFK-IDENT** residual-own                      |
| `pages/cms/Help*.vue`         | honesty empty≠FAQ invent                                               | **AFK-HELP-DETAIL** residual-own                |
| WhitePaper / BZB path         | no invent PDF (cmd-palette golden asserts absence)                     | **AFK-WHITEPAPER** retired                      |
| `App.vue` footer              | no invent social URLs (#464)                                           | **AFK-FOOTER MERGED**                           |
| `cmd-palette` + golden        | market/route not invented (#463)                                       | **AFK-CMDK-ROUTES MERGED**                      |
| `pages/intafaced/*`           | dual-book / no fake deployed badges                                    | **AFK-LAB-PASS** residual-own                   |
| `pages/otc/AdPublish.vue`     | 3× `placeholder="0.00"` frozen                                         | **no dedicated claim** · residual-fix candidate |

### Cross-check: `apps/web` / `apps/admin`

| surface                          | signal                                                    | verdict                                                                                                                        |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web` landing + tests       | header comments + fabricated-money ratchet / page.test    | honesty (prior invent **removed** from landing)                                                                                |
| `apps/web` `terminal.tsx` L87–88 | **live** `tickSize ?? '0.01'` · `lotSize ?? '0.00000001'` | **invented increments** (same family as scan class 2) — residual if `apps/web` still ships; sunset path may retire the surface |
| `apps/web` `Math.random`         | client order id entropy only                              | not market invent                                                                                                              |
| `apps/admin` ledger freeze       | “never invents a state” comments                          | honesty                                                                                                                        |

### Noise (not product invent)

- `jquery` / `gt.js` `Math.random` — third-party / captcha id
- Input `placeholder=` form UX outside money shapes — not balance invent
- `en.js` anti-fraud copy containing the word “fake”
- Golden fixtures asserting invent **mutations** (ix-money.legacy `68412…`) — tests, not UI
- `symbolFee: '0.001'` on Exchange — decimal-string rate default with `feeKnown` gate; **not** in fabricated-money BASELINE multiset this tip (still review when clearing scale debt)

### Prior invent removals still documented in-file (re-verified gone)

Invite fake leaderboard (`dataFanyong` live rows), Activity invented completion %, AppDownload hardcoded store pair, Index CNY 6.5 + zero sparkline, MinTrade yield invent, green▲ on null rose — comments describe **past** invent; identifiers/fallbacks **not** present as live data on this tip.

## Action

1. **Do not open a new invent-fix PR from OPS for “wave invent”** — **new hard invent count = 0**.
2. **Residual invent debt** is exactly the **10 frozen baseline rows** (+ optional `apps/web` terminal tick/lot defaults if that app remains product). Clear under free ownership; shrink BASELINE as rows die.
3. Next re-run after another ~5 Class N shell merges (or any invent-adjacent PR pile).
4. Visual check remains stamped `proof_missing: fleet-blocked` under NO-FLEET (foreign `:8090` is invalid visual).

## Proof

```
proof_missing: fleet-blocked
scan: static-rg + fabricated-money-scan.mjs
scope: vendor/coinexchange/05_Web_Front + apps/web + apps/admin cross-check
tip: c773dafa
shell_wave: #462-#472 · prior_rescan: #477 · tip_docs: #482
invent_line_hits: 87 (all honesty/doctrine)
fake_line_hits: 8
PriceTrend: 1 (historical)
Math.random_product: 1 (gt.js captcha)
new_hard_invent_residual: 0
fabricated_money_scan_exit: 0
fabricated_money_findings: 10 (all frozen baseline)
invent_fix_pr: none
apps_web_terminal_tick_lot_defaults: present (L87-88)
```

---

## Re-scan cycle3 — 2026-08-03T13:40Z · tip `c773dafa` (#482)

**Mode:** NO-FLEET · static `rg` only  
**Trigger:** night keep-alive freeProduct=0 pivot (not session kill)

| pattern                        |                         vendor front | verdict                                      |
| ------------------------------ | -----------------------------------: | -------------------------------------------- |
| `invent` (ci)                  |                               **87** | doctrine / honesty comments only             |
| `\bfake\b`                     |                                **8** | comments + anti-fraud copy                   |
| `PriceTrend` / `priceTrend`    |                                **1** | historical note in `en.js`                   |
| `Math.random` (non-min vendor) | captcha `gt.js` + vendored bignumber | not market invent                            |
| live `dataFanyong` rows        |                                **0** | only honesty comment in `Invite.vue`         |
| live `CNYRate \|\| 6.5`        |                                **0** | only REMOVED/comment notes in Index/Exchange |
| `mockTicker`                   |                                **0** | still gone                                   |

**No new invent residual.** Shell wave honesty holds on tip. Next re-scan after next vendor-touch PR or 2h idle.

---

## Re-scan cycle7 — 2026-08-03T14:12Z · tip `e4836982`

**Mode:** NO-FLEET · static `rg` · freeProduct=0 pivot  
**invent** ~94 lines (doctrine/honesty) · live dataFanyong invent **0** · live CNY 6.5 invent **0**  
**Verdict:** no new invent residual.

---

## Re-scan cycle13 — 2026-08-03T14:42Z · tip `4c0a5a16`

**Mode:** NO-FLEET · freeProduct=0 pivot  
**Verdict:** invent honesty comments only · live invent residual **0**.

---

## Re-scan cycle14 — 2026-08-03T14:50Z · tip `ed0421f7`

**Mode:** NO-FLEET · freeProduct=0 pivot  
**Verdict:** invent honesty comments only · live invent residual **0**.

---

## Re-scan cycle19 — 2026-08-03T15:12Z · tip `3d477ef0`

**Mode:** NO-FLEET · freeProduct=0 pivot  
**Verdict:** invent honesty comments only · live invent residual **0**.

---

## Re-scan cycle20 — 2026-08-03T15:15Z · tip `97085936`

**Mode:** NO-FLEET · freeProduct=0 pivot  
**Verdict:** invent honesty comments only · live invent residual **0**.
