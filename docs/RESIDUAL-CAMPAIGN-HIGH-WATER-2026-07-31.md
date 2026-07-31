# Residual campaign high water — compaction-safe

**Owner program:** Nitro residual board (third-dev screenshot R1–R7)  
**Law:** `docs/NITRO-RESIDUAL-CAMPAIGN-2026-07-31.md` (if present) · ownership `docs/NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md`  
**Live tip:** re-check `git log origin/main -1` — do not trust SHAs below after hours.

If this file disagrees with `gh pr list` / `origin/main`, **git wins**.

---

## 1. Verdict

Residual campaign is **COOK RUNNING**. Futures money path has recipes + open/close + bus + pure planners + callable ticks. **Not product-done** for any R1–R7 title. Honest partials only.

---

## 2. Third-dev board map (complete set)

| Row                     | Tracker     | Shipped this campaign (main)                                                                                                                                                 | Still open                                                                         |
| ----------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| web.terminal            | wip         | Stream A Wave A/B craft (#267+)                                                                                                                                              | Sub-accounts product; hotkeys residual                                             |
| ws.gateway              | wip         | Positions channel; F4 positionUpdated                                                                                                                                        | E2E WS load; mark-driven updates                                                   |
| pay.gateway             | wip         | Live rail #226; Postgres broadcast; refundId                                                                                                                                 | Card acquiring; merchant onboarding; go-live X                                     |
| protocol.smart-accounts | ready       | Dev chain + CREATE2 + honesty note                                                                                                                                           | Prod chain (X); audit; bundler/EntryPoint                                          |
| protocol.amm            | ready       | PoolFactory + mint/swap anvil proof                                                                                                                                          | Audit; prod factory                                                                |
| Trade mountains         | wip futures | F1 recipes · F2 table · F3 open/close · F4 bus · F5 funding recipe · insurance · **liq planner #292** · **liq tick #296** · **funding planner #291** · **funding tick #293** | Matching engine; mark oracle product; wall-clock cron hosts; realized PnL on close |
| Phase 5                 | ready many  | Shell honesty where APIs exist                                                                                                                                               | Full products                                                                      |

---

## 3. Merged high water (this fire — re-derive)

Tip order (newest first at write): funding tick **#293** · liq tick **#296** · liq planner **#292** · funding planner **#291** · AMM mint/swap **#288** · … · Wave A/B frontend sibling **#267/#295/#297/#298** (not residual-owned).

**Do not re-ship:** #226–#228 third-dev · #260–#298 residual/ownership/pay/futures/frontend slices already on main.

---

## 4. Collision map

| Lane                 | Status                        | Rule                                                     |
| -------------------- | ----------------------------- | -------------------------------------------------------- |
| Frontend Wave B      | Shipping on main              | Residual does not steal vendor shell craft               |
| **#289** order-route | Open · may conflict           | **Do not touch** from residual-coord                     |
| residual-coord       | This continuous residual chat | Futures ticks/planners · pay residuals · tracker honesty |
| third-builder        | Stood down                    | No re-claim without Nitro assign                         |

---

## 5. Named NEXT QUEUE

1. **Mark/index oracle product** — external only; never invent marks (feeds liq tick)
2. **Wall-clock cron hosts** — wire funding/liq ticks to ops scheduler (no product invent)
3. **Matching engine / mm-bot seed** — still missing for real books
4. **Realized PnL on close** — recipe path honesty
5. **WAVE-AUDIT** archive every 3–4 product ships
6. **smart-accounts** — still ready not done (prod/audit/bundler = X/sockets)
7. Human X only: prod RPC, secrets, go-live, licences

---

## 6. Hard bans

- Fake done / candles / balances / factory addresses / invent marks or rates
- Force-push Denon spines
- Sole-own Class M without self-audit in PR body
- Edit main checkout

_Update this file same turn as high-water advances._
