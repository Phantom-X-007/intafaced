# R-AFK-RESCAN — invent-pattern scan (Coord-OPS)

**When:** 2026-08-03 · tip `8abeb1c`  
**Mode:** NO-FLEET · static grep only (no visual)  
**Scope:** `vendor/coinexchange/05_Web_Front`  
**Claim:** AFK-RESCAN residual-own

## Method

Ripgrep for invent / fake / stub / PriceTrend / Math.random / hardcoded price-balance patterns. Distinguish **honesty law comments** (good — “never invent”) from **live invent residual** (bad).

## Findings

### No new hard invent residual spotted in this pass

Most `invent` hits are **doctrine comments** (never invent prices, rates, FAQs, social URLs, page counts). That is healthy.

### Known residual surfaces (already owned by free claims — do not dual-edit)

| surface                            | signal                                                       | owner claim                              |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| `pages/index/Index.vue`            | PriceTrend column titles; historical CNY 6.5 invent comments | **RP2** (sole Index) — AFK-INDEX blocked |
| `pages/exchange/Exchange.vue`      | money-on-wire / no invent fees comments                      | **RP1**                                  |
| `pages/uc/AppDownload.vue`         | §13 invented-content case documented in header               | **AFK-APPDOWNLOAD**                      |
| `pages/uc/IdentBusiness.vue`       | form placeholders (jurisdiction etc.)                        | **AFK-IDENT**                            |
| `pages/cms/Help*.vue` / WhitePaper | honesty empty≠FAQ invent                                     | **AFK-HELP-DETAIL** / **AFK-WHITEPAPER** |
| `App.vue` footer                   | no invent social URLs                                        | **AFK-FOOTER**                           |
| `cmd-palette` golden               | market not invented                                          | **AFK-CMDK-ROUTES**                      |
| `pages/intafaced/*`                | dual-book / no fake deployed badges                          | **AFK-LAB-PASS**                         |
| `components/uc/*`                  | empty≠zero sweeps                                            | **AFK-UC-COMP**                          |

### Noise (not product invent)

- `jquery` / `gt.js` Math.random — third-party / captcha id, not market invent
- Input `placeholder=` form UX — not money invent
- en.js `PriceTrend` string + fraud-warning copy containing word “fake”

### Prior invent removals already documented in-file

Invite fake leaderboard, Activity invented completion %, AppDownload hardcoded store pair — comments describe **past** invent that was removed or socketed. Re-verify only if a worker reintroduces data.

## Action

1. **Do not open a new invent-fix PR from OPS** — free AFK/RP workers own paths.
2. After ~5 shell merges, re-run this scan (`pnpm`/rg as above) and refresh this file.
3. Stamp any visual check as `proof_missing: fleet-blocked` under NO-FLEET.

## Proof

```
proof_missing: fleet-blocked
scan: static-rg only
tip: 8abeb1c
```
