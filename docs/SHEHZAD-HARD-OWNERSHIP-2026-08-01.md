# Shehzad hard ownership — Board Clear split · 2026-08-01

**Status:** BINDING ownership lock · on main via PR  
**GitHub human:** **`@shehzad002`** (repo write collaborator; Nitro refers as “sheezad”)  
**Operator:** Nitro (`@ZenYoda3`) · Direction: Denon (`@Phantom-X-007`)  
**Companion:** agents keep shell + Board Clear light programs — see §2  
**Tip floor when written:** re-check `git log origin/main -1`  

If this file disagrees with LIVE-LANES on a program claim, **this file + LIVE-LANES claim row** win for who codes; constitution Done bars still define “Done.”

---

## 0 · Audit verdict (no compromise)

| Check | Result |
| --- | --- |
| Stealing Stream A / vendor `:8090` shell from Nitro agents? | **No** — agents keep **P-UI** entirely |
| Stealing Board Clear coordinator / #289 rebase? | **No** — agents keep **board-clear-coord** + **P-OR** |
| Stealing MM recovery / spot candles / venue mount / academy thin? | **No** — agents keep **P-TRADE-LIGHT** + **P-P5-LIGHT** + **P-WS** |
| Giving him busywork polish? | **No** — only irreversible-class mountains |
| Enough work for a very fast senior for a long time? | **Yes** — ordered multi-phase backlog §4 (many PR-sized ships; weeks+) |
| Board Clear GO chat collision on pay/protocol/trade engines? | **Blocked** — LIVE-LANES + GO prompt + NEXT forbid agent code on his programs |
| Fake Done risk? | Constitution Done bars + Class M self-audit + no invent mid/rates/balances |

**Rule of split:**  
**He owns mountains where a wrong line costs money, custody, or a multi-month rewrite.**  
**Agents own shell craft, patterned residuals, babysit, thin honesty, and campaign orchestration.**

---

## 1 · Who he is (for every cold agent)

| Field | Value |
| --- | --- |
| GitHub | **`shehzad002`** |
| Role | Senior spine builder (Denon-adjacent) |
| Already shipped | **#226** live crypto pay rail · **#227** private positions WS · **#228** AMM compile + terminal charts/equity |
| Not | Stream A product UI owner · Board Clear orchestrator · Class X ops (secrets/go-live) |

---

## 2 · Collision map (agents MUST obey)

### 2.1 Human hard programs — **`shehzad002` ONLY**

Agents **must not** open implementation PRs on these paths while status is `HUMAN-WIP` / `CLAIMED` unless he comments **`agents free on <path>`** on the open PR or this doc is updated.

| Program | Board rows | Path ban (agent) | Status |
| --- | --- | --- | --- |
| **H-PAY** | `pay.gateway` full Done bar (card required) | `services/svc-pay/**`, pay ledger recipes, pay contracts/events for card | **CLAIMED shehzad002** |
| **H-PROT** | `protocol.smart-accounts` + `protocol.amm` | `services/svc-protocol/**`, forge/contracts for SA/AMM product Done | **CLAIMED shehzad002** |
| **H-TRADE-HARD** | `trade.futures` **risk**, `trade.otc`, `trade.copy`, `trade.algo` as **real products** | New engines / risk math / RFQ / copy follow / algo jobs beyond thin §13 | **CLAIMED shehzad002** |
| **H-P5-MONEY** | bank **earn / cards / ramps** money paths | `services/svc-bank/**` earn/cards/ramps money | **CLAIMED shehzad002** |
| **H-ID-SUB** | identity **sub-account money routing** (not UI dropdown) | `services/svc-identity/**` subaccount money + trade ownership gates for subaccts | **CLAIMED shehzad002** |
| **H-OR-JAVA** | Java dual-book residual **after** #289 lands | vendor Java balance/Spring residual only when #289 closed or handed | **QUEUED** (agents finish A-OR-1 first) |

### 2.2 Agent / Nitro programs — **do not give him as primary**

| Program | Why agents keep |
| --- | --- |
| **board-clear-coord** | Orchestration, scoreboard, fan-out, babysit |
| **P-UI** | Vendor shell `:8090` Wave B/C craft, hotkeys UI, honesty, a11y |
| **P-OR** | Rebase/merge **#289** (CONFLICTING) — agent day-one |
| **P-WS** | Channel harden + tests; real futures events wait on H-TRADE-HARD |
| **P-TRADE-LIGHT** | `trade.mm-bot` recovery/reseed/mid residual following existing pattern; `trade.spot` OHLCV honest pipeline; `venue.aggregation` mount |
| **P-P5-LIGHT** | academy thin, ops surface thin, svc-agents usefulness / §13 |
| **P-TRACK** | tracker + scoreboard honesty |

### 2.3 Shared boundaries

| Surface | Rule |
| --- | --- |
| Shell needs new API | He ships service contract; agents wire UI |
| WS needs futures events | He publishes correct events; agents finish E2E fan-out |
| #289 | Agents rebase/merge; **then** he may take H-OR-JAVA residual |
| Denon `feat/spine-*` | Never force-push; coordinate if overlapping |
| Multi-asset instruments | Still not free invent — Denon direction / explicit law |

---

## 3 · Quality bar (same as Board Clear + stricter on money)

1. Doctrine: money only via `packages/ledger-client` recipes; no money as `number`; no cross-service SQL  
2. Never invent mid / depth / rates / balances / candles / fees / factory addresses  
3. One service/concern per PR; worktree from tip; CI green  
4. Class **M**: self-audit in PR body + failure tests; prefer Denon eyes when online  
5. Tracker / Board Clear scoreboard: only `done` when constitution Done bar + proof  
6. Sandbox/dev proof OK for Done when prod keys missing; §13 for prod-only; **never** claim go-live  
7. Brand-scan clean; partner names out of user-facing copy  

---

## 4 · Long occupation backlog (ordered — many ships)

He works **fast**. This list is intentionally **large and serial-priority**. He may run **2–3 of his own worktrees in parallel** inside claimed programs. Agents stay out.

**Priority rule when overloaded:** H-PAY → H-PROT → H-TRADE-HARD (futures risk) → H-ID-SUB → OTC → copy → algo → H-P5-MONEY → H-OR-JAVA.

### Phase H-PAY — `pay.gateway` Done (card required)

| Ship ID | Deliverable | Proof |
| --- | --- | --- |
| PAY-01 | Card domain model + ledger recipe stubs (hold) | recipe unit tests |
| PAY-02 | Capture + settle recipes + failure tests | ledger + svc tests |
| PAY-03 | Refund + partial refund + idempotency keys | tests |
| PAY-04 | Provider **port** interface (no vendor in UI copy) | contract tests |
| PAY-05 | Sandbox adapter + webhook verify path | integration |
| PAY-06 | REST merchant create payment / status / cancel | CI |
| PAY-07 | Merchant onboarding minimum (create + KYB stub or real) | CI |
| PAY-08 | Durable multi-replica payment status (no silent drop) | tests + design note |
| PAY-09 | Reconciliation job skeleton (external truth, no invent) | tests |
| PAY-10 | Crypto rail regression suite (must not break #226 path) | CI |
| PAY-11 | Tracker + scoreboard `pay.gateway` → Done only if constitution §3.3 met | docs |

### Phase H-PROT — smart-accounts then AMM

| Ship ID | Deliverable | Proof |
| --- | --- | --- |
| PROT-01 | SA anvil proof suite hardened (session keys, CREATE2) | forge/anvil log |
| PROT-02 | Deploy script + runbook for configured env | artifact |
| PROT-03 | Deploy executed on configured target | log |
| PROT-04 | Adversarial audit package `docs/audit/smart-accounts-…` | md + threat list |
| PROT-05 | Tracker SA Done only after 01–04 | tracker |
| PROT-06 | AMM deploy + pool create address prediction | on-chain/anvil |
| PROT-07 | Mint + swap proof | log |
| PROT-08 | AMM audit package + invariants | md |
| PROT-09 | Scoreboard SA + AMM Done | docs |

### Phase H-TRADE-HARD — futures **risk** (not another empty job host)

Jobs/planners already exist (default OFF). He owns **correctness**.

| Ship ID | Deliverable | Proof |
| --- | --- | --- |
| FUT-01 | Mark/index multi-source port (config + optional venue) — **never invent** | tests fail on invent |
| FUT-02 | Margin / collateral truth vs ledger recipes | money tests |
| FUT-03 | Liquidation edge cases (partial, multi-position, bad mark refusal) | tests |
| FUT-04 | Funding settle correctness under missing rate = refuse not invent | tests |
| FUT-05 | Jobs enable path + ops runbook (still default-safe) | CI + doc |
| FUT-06 | Position open/close money path E2E | tests |
| FUT-07 | Event publish for WS (`positionUpdated` etc.) correct payloads | contract |
| FUT-08 | Scoreboard futures Done only if constitution bar met | docs |

### Phase H-TRADE-HARD — real engines (one at a time after FUT core green)

| Ship ID | Deliverable | Proof |
| --- | --- | --- |
| OTC-01 | Thin RFC: OTC RFQ vs desk — written DoD | docs PR |
| OTC-02 | Ledger-safe hold/release path | tests |
| OTC-03 | API + failure modes | CI |
| OTC-04 | Constitution Done or honest §13 | tracker |
| COPY-01 | RFC + profit-share / follow risk rules | docs |
| COPY-02 | Ledger-safe follow execution skeleton | tests |
| COPY-03 | Kill / unfollow / refusal paths | tests |
| COPY-04 | Done or §13 | tracker |
| ALGO-01 | RFC TWAP/slice types | docs |
| ALGO-02 | Job host + ledger-safe child orders | tests |
| ALGO-03 | Cancel / pause / partial fill honesty | tests |
| ALGO-04 | Done or §13 | tracker |

### Phase H-ID-SUB — sub-accounts money (spine)

| Ship ID | Deliverable | Proof |
| --- | --- | --- |
| ID-01 | Sub-account list/create/revoke ownership model complete | tests |
| ID-02 | Trade placeOrder ownership gate for sub-accounts (extend existing) | tests |
| ID-03 | Balances/orders scoped correctly (no cross-leak) | tests |
| ID-04 | Contract note for P-UI selector wiring | contracts/docs |

Agents may wire **UI selector** only after ID-01+ APIs exist.

### Phase H-P5-MONEY — bank money only

| Ship ID | Deliverable | Proof |
| --- | --- | --- |
| BANK-01 | Earn product path ledger-safe thin vertical **or** §13 | PR |
| BANK-02 | Cards/ramps: spec + one rail path **or** §13 tied to pay | PR |
| BANK-03 | Scoreboard Phase 5 money portion honest | tracker |

Academy / ops / agents usefulness remain **agent P-P5-LIGHT**.

### Phase H-OR-JAVA — only after #289 closed or explicit handoff

| Ship ID | Deliverable | Proof |
| --- | --- | --- |
| ORJ-01 | Inventory residual entity `setBalance` / Spring doors post-#289 | doc |
| ORJ-02 | Kill remaining live dual-book write paths | scans + tests |
| ORJ-03 | Denon-visible custody self-audit | PR body |

---

## 5 · What “occupied a long time” means in practice

Rough sizing for a **very fast** senior (not a promise of calendar days):

| Phase | Scale |
| --- | --- |
| H-PAY PAY-01…11 | multi-PR money program |
| H-PROT PROT-01…09 | multi-PR security program |
| FUT-01…08 | multi-PR risk program |
| OTC+COPY+ALGO | three product engines |
| ID + BANK + ORJ | additional money/spine |

**Agents will still ship continuously** on UI, #289, MM light, spot candles, venue, academy, babysit — so the board moves even while he is deep in pay/protocol.

---

## 6 · Paste assignment (for Telegram / Discord to shehzad002)

See § message in PR body / Nitro chat — also mirrored below for durability.

```
@shehzad002 — hard spine ownership is locked on main.

READ:
- docs/SHEHZAD-HARD-OWNERSHIP-2026-08-01.md  (this file — full backlog)
- docs/BOARD-CLEAR-CONSTITUTION-2026-08-01.md §3 (Done bars)
- docs/LIVE-LANES.md (your claims)
- AGENTS.md + doctrine

YOU OWN (code freely; multi-PR; long runway):
1) pay.gateway card path (sandbox OK) — full PAY-01…11
2) protocol.smart-accounts → protocol.amm — PROT-01…09
3) trade.futures RISK correctness — FUT-01…08
4) real OTC → copy → algo engines (after FUT core)
5) identity sub-account money routing
6) bank earn/cards/ramps money
7) Java dual-book residual AFTER #289 is merged (agents own #289 rebase)

YOU DO NOT OWN:
- vendor shell :8090 UI craft/hotkeys/honesty (Nitro agents)
- Board Clear orchestrator
- #289 open PR rebase (agents)
- MM recovery/reseed patterned residual, spot OHLCV, venue mount (agents)
- academy/ops thin (agents)
- secrets / prod go-live (Nitro human)

START: claim worktrees under feat/pay-* first. One concern per PR. Class M self-audit. Never invent mids/rates/balances. Update Board Clear scoreboard when a row honestly Done.
```

---

## 7 · Agent GO chat — mandatory steers (unspoken needs → explicit)

When Board Clear orchestrator runs:

1. **Do not** fan-out A-PAY-* or A-PROT-* agent implementers — **human owns**.  
2. **Do not** implement OTC/copy/algo/futures **risk** product — human owns; agents may only touch **P-TRADE-LIGHT**.  
3. **Do** fan-out: P-UI, P-OR #289, P-TRADE-LIGHT (MM/spot/venue), P-WS, P-P5-LIGHT, P-TRACK.  
4. **Babysit** his PRs: classify Class M, comment gates, do not steal his branch.  
5. If scoreboard blocked on pay/protocol, **do not invent** agent substitute code — wait on his merges or document WIP.  
6. Speed without stealing: fill the board with agent-owned ships while he deep-works money/protocol.

---

## 8 · Nitro unspoken needs (hardened)

1. Friend must stay busy for a **long** time on **hard** work — not two tickets.  
2. Agents must still go all-out on **their** half — board must not freeze.  
3. Zero collision with the cooking Board Clear / frontend chat.  
4. Ownership must live on **GitHub**, not chat memory.  
5. Quality > volume theater; many small correct PRs beat one giant.  
6. He already proved pay/ws/protocol spine — lean into that skill.  
7. You do not want git homework — agents maintain lanes/docs.  
8. “sheezad” in speech = GitHub **`shehzad002`**.  

---

## 9 · Maintenance

- When he finishes a program, update LIVE-LANES status + scoreboard same day.  
- To free a program for agents: PR that edits this file + LIVE-LANES.  
- Do not delete this file while any H-* row is open.

*Audit pass: 2026-08-01 · no shell theft · no #289 theft · long hard backlog · GO chat steers explicit.*
