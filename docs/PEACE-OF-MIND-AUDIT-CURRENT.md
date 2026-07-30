# Peace of mind — current floor (Nitro)

**Date:** 2026-07-30  
**Main tip (literal SHA this audit closed against after fix PR merges — refresh on next fetch):** see bottom **TIP block**  
**Pre-fix cook tip audited:** `2d1582143b0c1a95e8250a2f53f68fa71eb6b9ad` (#174)  
**SINCE baseline:** `8a8c19bc626e6dada49a33be1f88d17873f42502` (#107)  
**Archive:** [`audit/2026-07-30-afk-cook-mega/`](audit/2026-07-30-afk-cook-mega/)  
**Claim tags:** `[VERIFIED 2026-07-30]` mega-audit AFK cook (local gates + code-path L3; **not** Actions green; **not** money e2e without Postgres)

**Stream A:** [NITRO-STREAM-A-CLAIM.md](NITRO-STREAM-A-CLAIM.md) · uiproof PROOF **UNVERIFIED** this tip

---

## Verdict (one breath)

**Cook delta is sound for Denon to open GitHub without flinching on money/auth/migrate/brand — agent P0s fixed; honest residuals named.** Keep building product. **Not go-live.** Actions still fail in seconds (billing). Money PG suites never ran on this host. OHLCV/positions honestly empty. Chain/rails sandbox.

---

## Scoreboard

| System         | Risk now                                                                       | Status                                       |
| -------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| Ledger         | Low if perimeter holds                                                         | OK · PG suite **SKIPPED** local              |
| Identity       | Soft revoke + apiKeys.exchange                                                 | OK · CODE-REVIEWED                           |
| Pay            | Links + hosted HTML; no card invent; rails sandbox                             | OK · residual rails                          |
| Token          | Yield/buyback in delta                                                         | OK · CODE-REVIEWED                           |
| Trade          | Convert + private REST; subAccount fail-closed; market buy cost via protection | OK · PG suite **SKIPPED**                    |
| Protocol / DEX | Factory honesty; not chain-done                                                | Build · not product-complete                 |
| Vendor shell   | UI only                                                                        | OK                                           |
| Deploy         | notify in fleet; private WS JWT **wired** this audit                           | Usable with care                             |
| CI             | Doctrine law local green                                                       | **Actions red** (run 30518194347 zero steps) |
| Migrations     | 0002 trade backfill for #167 applied-DBs                                       | **M1 fixed** this audit                      |

---

## Closed this audit (agent)

- Brand red on plan overlay (model-provider name scrub)
- format:check red
- M1: new `svc-trade` `0002_display_name_backfill` (do not re-edit applied 0001)
- R5: `subAccountId` fail-closed until ownership gate
- R6: filled market buy cost no longer silent `"0"` (protection ceiling; sell residual)
- WS-JWT: compose + audience default for private stream
- Free-mountains scoreboard fossils labeled

## Closed earlier (do not re-open without regression)

- #80 · #81 · #86 · #96 · #99 · #101 · #102 · #105 · Proper Track 1 · cook #110–#174 surfaces per archive

---

## Still open (honest residuals)

| Item                                                  | Verdict                                                          | Who                           |
| ----------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| GitHub Actions zero-step failures (billing)           | **CANNOT VERIFY green** — runs fail in seconds, e.g. 30518194347 | **Human**                     |
| Money e2e / PG suites local                           | **SKIPPED** — no Docker/Postgres                                 | Human install or CI when paid |
| OHLCV / positions                                     | **HOLDS** honest empty                                           | Product (candles / futures)   |
| Factory / chain                                       | **HOLDS** honesty; not deployed                                  | **Denon**                     |
| Pay rails sandbox                                     | residual double-submit until real rails                          | Money agent when rails real   |
| Market sell CCXT `cost` still `"0"` without fill load | residual after R6 nit                                            | Agent later                   |
| Sub-account ownership S2S                             | fail-closed now; wire identity later                             | Agent                         |
| Stream A PROOF / Chromium                             | **UNVERIFIED**                                                   | Nitro desktop                 |
| Licences · wallet secrets · counsel list · kill drill | human/ops/law                                                    | Denon + you                   |
| Dual-book policy discipline                           | habit                                                            | All                           |

---

## TIP block (literal)

```
PRE-FIX TIP (audit start): 2d1582143b0c1a95e8250a2f53f68fa71eb6b9ad
SINCE:                   8a8c19bc626e6dada49a33be1f88d17873f42502
POST-FIX TIP:            d926edfc6479dcb0f8babe226415cf60992b130c (#176)
```

Archive proof: `docs/audit/2026-07-30-afk-cook-mega/01-L0.md` through `06-VERDICT.md`.
