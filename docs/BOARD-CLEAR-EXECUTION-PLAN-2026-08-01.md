# Board Clear Execution Plan — 2026-08-01

**Binding with:** [`BOARD-CLEAR-CONSTITUTION-2026-08-01.md`](BOARD-CLEAR-CONSTITUTION-2026-08-01.md)  
**Purpose:** Spec + decompose so orchestrators execute without Nitro.  
**Rule:** No code for a row until its slice has a Done-linked ship list below (or an addendum PR updates this file first).

---

## 0. Programs (parallel ownership)

| Program ID  | Board rows                                    | Worktree prefix                                         | Collision ban                               |
| ----------- | --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| **P-UI**    | web.terminal                                  | `feat/ui-` `feat/web-`                                  | **vendor/** shell :8090 — not apps/web      |
| **P-WS**    | ws.gateway                                    | `feat/ws-`                                              | services/svc-ws (or actual ws package)      |
| **P-PAY**   | pay.gateway                                   | `feat/pay-`                                             | services/svc-pay, pay recipes               |
| **P-PROT**  | smart-accounts, amm                           | `feat/protocol-`                                        | services/svc-protocol, contracts            |
| **P-TRADE** | spot, futures, mm-bot, otc, copy, algo, venue | `feat/trade-`                                           | services/svc-trade, matching only if needed |
| **P-OR**    | order-route #289                              | existing order-route branch / `feat/order-route-`       | order-route docs+code only                  |
| **P-P5**    | bank, academy, ops, agents                    | `feat/bank-` `feat/academy-` `feat/ops-` `feat/agents-` | respective services                         |
| **P-TRACK** | scoreboard/tracker                            | `chore/tracker-` `docs/board-`                          | docs + tracker only                         |

Orchestrator may run **one agent per program** (or more if sub-sliced with non-overlapping paths).

---

## 1. Dependency graph (hard)

```
P-PROT smart-accounts ──► P-PROT amm
P-TRADE futures/mm events ──► P-WS E2E
P-TRADE spot money ──► P-UI trade actions truth
P-PAY card recipes ──► P-PAY REST/UI hooks
P-OR may touch matching/trade docs — coordinate with P-TRADE via contracts first
```

Everything else is **Wave A parallel**.

---

## 2. Wave plan

### Wave 0 — Constitution live

- [x] Constitution + plan + GO + loops + unspoken needs
- [x] Scoreboard + NEXT
- [x] START-HERE + session prompt pointers
- [x] Preflight audit + LIVE-LANES Board Clear rewrite

### Wave A — fan-out (start immediately after Wave 0 merges)

| Ship ID         | Program | Deliverable                                                   | Proof                             |
| --------------- | ------- | ------------------------------------------------------------- | --------------------------------- |
| A-UI-1          | P-UI    | Hotkeys + order ticket keyboard path                          | tests / e2e / manual script in PR |
| A-UI-2          | P-UI    | Sub-accounts selector wired or §13                            | PR                                |
| A-UI-3          | P-UI    | Honesty pass: empty book, errors, envelope                    | PR                                |
| A-PAY-1         | P-PAY   | Card domain model + ledger recipes (sandbox)                  | ledger tests                      |
| A-PAY-2         | P-PAY   | Card provider port + sandbox adapter                          | unit + contract tests             |
| A-PAY-3         | P-PAY   | Capture/settle/refund money path + REST                       | CI                                |
| A-PAY-4         | P-PAY   | Merchant onboarding minimum                                   | CI                                |
| A-PROT-1        | P-PROT  | Smart-accounts anvil proof suite hardened                     | forge/anvil                       |
| A-PROT-2        | P-PROT  | Deploy script + runbook + deploy to env                       | log artifact                      |
| A-PROT-3        | P-PROT  | Adversarial audit package SA                                  | docs/audit                        |
| A-TRADE-MM-1    | P-TRADE | orderFilled makerAccountId + MM recovery                      | tests                             |
| A-TRADE-MM-2    | P-TRADE | Cancel/reseed lifecycle                                       | tests                             |
| A-TRADE-MM-3    | P-TRADE | Mid oracle port (config + optional venue)                     | tests                             |
| A-TRADE-FUT-1   | P-TRADE | Mark/index multi-source non-invent                            | tests                             |
| A-TRADE-FUT-2   | P-TRADE | Jobs enable path + ops doc                                    | CI                                |
| A-TRADE-SPOT-1  | P-TRADE | Candle aggregation job or honest pipeline                     | tests                             |
| A-TRADE-VENUE-1 | P-TRADE | Mount venue fabric into mark or public path                   | tests                             |
| A-TRADE-OTC-1   | P-TRADE | Thin OTC or §13 research+socket                               | PR                                |
| A-TRADE-COPY-1  | P-TRADE | Thin copy or §13                                              | PR                                |
| A-TRADE-ALGO-1  | P-TRADE | Thin algo or §13                                              | PR                                |
| A-OR-1          | P-OR    | **#289 rebase onto main** (was CONFLICTING) then merge/absorb | green merged or closed            |
| A-P5-1          | P-P5    | Bank earn thin slice or §13                                   | PR                                |
| A-P5-2          | P-P5    | Academy thin slice or §13                                     | PR                                |
| A-P5-3          | P-P5    | Ops surface + agents usefulness or §13                        | PR                                |
| A-WS-1          | P-WS    | Harden private channels + tests (may mock trade until B)      | CI                                |

### Wave B — integrate

| Ship ID  | Depends               | Deliverable                                      |
| -------- | --------------------- | ------------------------------------------------ |
| B-WS-2   | A-TRADE-FUT/MM events | Real futures position stream E2E                 |
| B-UI-4   | A-TRADE + A-WS        | Terminal consumes live WS where available        |
| B-PROT-4 | A-PROT-1..3           | AMM deploy + mint/swap proof + audit package     |
| B-PAY-5  | A-PAY-*               | pay.gateway tracker Done criteria met            |
| B-OR-2   | A-OR-1                | Order-route closed or absorbed                   |
| B-SCORE  | all                   | Tracker Done/Cut for every row; scoreboard final |

### Wave C — closeout

- Full board scoreboard green/cut
- High-water “BOARD CLEAR” verdict
- Close campaign autonomous run
- No open campaign PRs

---

## 3. Per-program detailed specs (minimum)

### 3.1 P-UI (web.terminal)

**Research first:** `docs/FRONTEND-STATE-OF-TRUTH-*.md`, brand locks, stream A claim; tree under **vendor shell :8090**.  
**Do not** build `apps/web` as product. Do not redesign whole app if shell works — finish gaps.  
**Ships:** hotkeys, sub-accounts, order form honesty, empty book honesty, a11y.  
**Done proof:** PR list + Orca/playwright/screenshot; tracker web.terminal → done.

### 3.2 P-WS

**Research:** existing private stream routes, event catalog `orderUpdated` `fillSettled` `positionUpdated`.  
**Ships:** subscription auth, backfill policy, position fan-out E2E.  
**Done proof:** integration test with trade publishing events.

### 3.3 P-PAY

**Research:** existing pay recipes, merchant.create honesty, rails live crypto.  
**Ships:** card adapter interface; sandbox Stripe-or-equivalent **only if already allowed by doctrine** — if doctrine forbids named vendor in UI, vendor stays in adapter not copy.  
**Money:** hold → capture → settle → refund recipes with failure tests.  
**Done proof:** recipe tests + service tests; tracker pay.gateway done.

### 3.4 P-PROT

**Research:** svc-protocol README, forge tests, factory addresses.  
**Ships:** SA deploy + audit package → AMM mint/swap + audit.  
**Done proof:** anvil log + audit md + tracker done.

### 3.5 P-TRADE

**Research:** residual high-water, mm-bot research, futures jobs env.  
**Priority order inside trade:**

1. mm-bot recovery + reseed + mid port (unlocks books)
2. futures mark/index + jobs ops
3. spot candles
4. venue mount
5. otc/copy/algo thin or §13

**Done proof:** each sub-feature tracker note → done when bar met.

### 3.6 P-OR

**Research:** open PR #289 state, CI, conflicts with main.  
**Ships:** green merge or split into claimable residuals with constitution acknowledgment.  
**Ban:** infinite open PR.

### 3.7 P-P5

**Research:** tracker Phase 5 rows, doctrine phase gates.  
**Ships:** one vertical slice per area **or** §13 with why not now.  
**Ban:** marking whole Phase 5 done without slices.

---

## 4. Execution loop (orchestrator forever)

```
loop until scoreboard all Done|Cut:
  1. Read CONSTITUTION + this PLAN + SCOREBOARD + origin/main tip
  2. List open campaign PRs → babysit red CI → merge green Class M/N/P
  3. Pick highest-priority unblocked ship from Wave A then B
  4. Spawn worktree + implement + verify + PR + babysit + merge
  5. Update SCOREBOARD + tracker same turn
  6. If ship needs research, spend research then ship same wave (no research-only forever)
  7. Never wait for Nitro
```

### Priority when overloaded

1. Money path correctness (pay card, trade settle, protocol deploy)
2. web.terminal Done (visible product)
3. ws E2E
4. trade completeness (mm, futures, venue)
5. order-route close
6. Phase 5 slices

---

## 5. PR standards

- Title: `type(scope): …`
- Body: what / why / how I know / money self-audit if Class M
- One service/concern
- CI green before merge
- Squash-merge; delete remote branch

---

## 6. Replan triggers (update this file)

- Main tip moves with Denon conflicts
- A Done bar proves impossible without invent → rewrite bar + §13, don’t invent
- #289 scope explosion → split ships, keep claimed
- Secret class truly absent → sandbox Done + §13 prod

---

## 7. Completeness checklist (orchestrator self-check)

Before claiming campaign finished:

- [ ] Every §3 constitution row Done or Cut+§13
- [ ] Tracker matches scoreboard
- [ ] No open Board Clear PRs red
- [ ] #289 not orphan
- [ ] Protocol has deploy proof + audit package
- [ ] Pay has card path proof
- [ ] Trade mountains each addressed
- [ ] Phase 5 each addressed
- [ ] START-HERE points here
- [ ] Autonomous run doc still accurate

If any box unchecked → **not finished — continue loop**.
