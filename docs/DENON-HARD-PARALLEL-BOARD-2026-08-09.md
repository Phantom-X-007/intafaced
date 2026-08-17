# Denon — remaining work (re-derived 2026-08-17)

**Audience:** `@Phantom-X-007` (Denon)  
**Status:** BINDING · **Rev:** **remaining-work pass** (replaces Aug 9 SAFE START)  
**Tip at write:** `fdaf1a89` (`feat(svc-bank): addCollateral… #2245`)  
**Open PRs:** re-derive `gh pr list --state open` — at write: **#2011** (Denon docs, close), **#1177** (Shehzad), Dependabot.

Companion: [`THREE-WAY-DISTRIBUTION-2026-08-04.md`](THREE-WAY-DISTRIBUTION-2026-08-04.md) · [`LIVE-LANES.md`](LIVE-LANES.md)  
Spec factory (done — do not re-write): [`SPEC-FACTORY-INDEX-2026-08-04.md`](SPEC-FACTORY-INDEX-2026-08-04.md)  
Owner packet (P0 already sealed/refuse): [`ops/owner-ruling-packet.json`](ops/owner-ruling-packet.json)

---

## 0 · Why this rewrite

The Aug 9 board was right _then_: a residual PR wall made hot services **HOT HOLD**, so SAFE START was P0 rulings + P3/P4 docs.

That wall is gone. Agents kept executing SAFE START anyway. Result: 17 Aug was a **law re-seal mill** (P0-05 sealed as #1784 then recooked as #2005; same pattern on P0-06/07/15/17) plus compose-env stamp mill on 16 Aug. LIVE-LANES stayed **LIVE** on merged work. Tokens burned; product did not move.

**This file now answers: what should be done next.** Sealed IDs are an archive at the bottom. Do not reopen them as tickets.

---

## 1 · STOP (do not spawn)

| Pattern                                    | Status                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| D26-P0-01…18 docs/ADR recook               | **SEALED** (refuse-closed or named law). Magnitudes = owner click, not another ADR. |
| PKT-B5/B6/C7/C8/C9 / PAYOUT-01 docs recook | **SEALED** refuse or handoff.                                                       |
| D26-P3-01…11 runbooks                      | **LANDED** 15–17 Aug.                                                               |
| D26-P4-01…09 ops/tracker protocol          | **LANDED** (this pass is the P4-09 honesty close).                                  |
| D26-P2-12 “deepen spine reprove”           | **LANDED** (matching/ledger/identity).                                              |
| Per-service `pass X into compose`          | **MILL** — not a mountain.                                                          |
| Close #2011 by rewriting P2-04             | Duplicate of landed **#1785**. Close the PR.                                        |
| Shehzad #1177 implement                    | Babysit only.                                                                       |
| Vue / `nitro-frontend-all`                 | HUMAN.                                                                              |
| Class X lists, secrets, go-live, counsel   | Nitro human.                                                                        |

**HOT HOLD is over.** Six (now five) open PRs do not collide with `svc-trade` / `svc-pay` / `packages/ledger-client`. Code remaining engines. Path-intersect anyway.

---

## 2 · NOW — code these (invent-risk · you)

No open PR holds these paths. Tracker still shows residual. Agents must not take them.

| Order | ID / tracker                           | Remaining done bar                                                                                                                                                                                                                                                                  | Why still you                                                     |
| ----- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **1** | **`pay.gateway`**                      | Wire existing `kybStatus` into `payment.create` / `checkout.open` / `settlement.run` / withdraw so `rejected` cannot transact like `approved`. Card acquiring stays `socket.psp-partners`.                                                                                          | Product-complete money gate. Note still says KYB has no consumer. |
| **2** | **D26-P1-T1 `trade.futures`**          | Umbrella close **or** honest named residual. On tip: T1a–g mechanism. Still not umbrella-done: leveraged entry must name leverage on POST /positions (no silent 1×); funding jobs stay owner-enable (PKT-B6); D3 ladder numbers; PKT-B5 profit-source account. Do not invent rates. | Invent leverage/funding/ADL.                                      |
| **3** | **D26-P1-X3 `execution.sor`**          | OMS/EMS on the thin `svc-execution` already on tip (house-tenant Stage-1). Cost model + 5 bps cap landed. Do not invent letter→bps. Do not point house at our book (P0-01).                                                                                                         | Fake Done (“router exists”).                                      |
| **4** | **`venue.aggregation` / X1**           | Trading half still `not_ready`; no live-network CI; latency grade still has no SOR consumer. Public MD adapters (binance + bybit) exist. Do not invent mids.                                                                                                                        | Connect honesty.                                                  |
| **5** | **D26-P1-P9 durable crypto broadcast** | `pay.rails` is adapter-done. Residual: multi-replica `BroadcastStore` (today in-process Memory). Crash-resume before broadcast is the product, not another map.                                                                                                                     | Crash-resume lie.                                                 |

**Do next after 1–5, only if still true on tracker:** `trade.copy` auto-mirror residual · `ws.gateway` remaining streams · `academy.tournaments` prize amounts (refuse until owner numbers — do not invent IFC) · `connect.data-lake` **store pick is owner** (capture honesty already shipped; do not choose a TSDB in a PR).

---

## 3 · NOW — human clicks (not agents, not ADRs)

| ID                  | What                                                                 | Why not a PR                                                                              |
| ------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **#2011**           | Close as duplicate of #1785                                          | Docs recook                                                                               |
| **PKT-D10**         | `act/pom.xml` rpc-common duplicate                                   | Unreviewed third-party; human edit                                                        |
| **GH-G1 / G2 / G3** | Branch protection tighten / CODEOWNERS required / `allow_auto_merge` | Admin clicks; agents must not PUT                                                         |
| **GH-G5**           | ZenYoda3 shared-identity frame                                       | Decision, not code                                                                        |
| **Magnitudes**      | §8 rates, dex venue set, settlement assets, profit-source account    | Packet already refuse-closed. Name numbers **or** leave refuse. Do not write a third ADR. |
| **Class X**         | Notify credentials, wallet secrets, sanctions list, licence, go-live | Nitro + counsel                                                                           |

---

## 4 · Collision / ownership (unchanged)

| Not yours                                | Owner                      |
| ---------------------------------------- | -------------------------- |
| Vendor shell / terminal UX               | `nitro-frontend-all`       |
| Protocol / INTACHAIN / lending implement | `@shehzad002` (#1177 open) |
| Class X content                          | Nitro human                |
| §13 sockets as implement tickets         | Nobody                     |
| `pay.gateway` **rebuild** / second book  | Forbidden (leverage law)   |

Agents may residual-wire from tip on reclaimed pay/bank **except** the five NOW rows while you are coding them. Claim the row in LIVE-LANES first.

---

## 5 · Attack order (now)

1. Close **#2011**.
2. **`pay.gateway` KYB consumer** (one service, Class M, existing flag).
3. **`trade.futures` umbrella** — leveraged-entry named-or-refuse; park funding/D3/PKT-B5 as owner residuals in the tracker note; do not mark umbrella `done` until those are named or socketed.
4. **`svc-execution` OMS** on existing thin service.
5. **Venue trading half** or **durable BroadcastStore** (pick one path; one PR).

Parallel OK: KYB consumer worktree + futures worktree — **not** the same files.

---

## 6 · What Nitro agents keep

- Babysit #2011 close + Shehzad #1177
- Shell under `nitro-frontend-all` (HUMAN — they do not edit it)
- Reclaimed pay/bank **thin** from tip, path-disjoint from the five NOW rows
- Implement **from sealed P0** once you land an engine (refuse-closed is the law)

**Agents must not:** take the five NOW engines · invent §8 · dual-edit your open files · close Class X · recook P0/P3/P4

---

## 7 · Sealed archive (do not reopen as tickets)

Proof is on `main`. This is not a backlog.

### P0 — owner law (sealed / refuse-closed)

P0-01 house desk · P0-02 §8 refuse · P0-03 dex venue refuse · P0-04 token authority · P0-05 options/forex freeze · P0-06 listing refuse-blank · P0-07 10× freeze · P0-08 pay grantor refuse · P0-09 fee recipe matrix · P0-10 commission refuse-blank · P0-11 scanner inputs · P0-12 attestation threat · P0-13 launchpad economics refuse · P0-14 mark dust keep-shipped · P0-15 copy geo refuse · P0-16 marketing-language ban · P0-17 empty insurance → no list · P0-18 packet index.

### P1 — engines already on tip (mechanism)

Futures T1a–g · OTC RFQ+durable quotes · copy placeMirror · algo TWAP/VWAP/POV · ccxt matrix · mm-bot seed honesty · options/forex refuse-closed · pay PSP/PayFac/public-api/settlement/fraud/subscriptions-crypto · bank earn/cards/ramps/loans · ops affiliates producer wire · market commerce refuse-blank · academy certs/curriculum/ambassadors refuse · Connect capture honesty + latency grade · Execution cost model + external arb/MM packages + house-tenant Stage-1.

**Not the same as tracker `done`.** Several rows stay `wip`/`ready` for live env, Vue, or owner numbers. That residual is section 2, not a docs ticket.

### P2 — integrity (landed)

Promise-falsify public doors · Java money-plane map · unreachable-guard matching doors · fleet image runbook **#1785** · event bus · one-book 5 bps · Grade D/jar · custody-scan Java · wallet_rpc perimeter · kill-switch · recipe matrix · money-spine re-prove · skip-honesty · brand-scan vendor shell · fillId SoT.

### P3 / P4 — run + cleanup (landed)

Staging dispatch · threat model · load-test stub · NOTICE pin · secret rotation runbook · auth review · CORS posture doc · incident runbook · backup drill · Java in scan · spine disposition · bridge handshake doc · GitHub rails re-derive · issue reconcile · depth/tape SLO · Java vs TS SoT · tracker thrash protocol · tracker honesty notes.

---

## 8 · Cold start

```
git fetch origin main
git log -1 --oneline origin/main
gh pr list --state open
Read: docs/DENON-HARD-PARALLEL-BOARD-2026-08-09.md  (this file — NOW section)
Read: docs/LIVE-LANES.md
Path-intersect every PR
Start: pay.gateway KYB consumer OR trade.futures umbrella OR svc-execution OMS
Do NOT start: P0 ADR, P3 runbook, P4 table, P2-12 deepen, compose pass-through
```

---

## 9 · Changelog

| Date           | Change                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-09a    | v1 board: first substance handoff · ~47 IDs · SAFE START/HOT HOLD                                                                                                |
| 2026-08-09b    | v2 mass thicken ~2.5× (~120 IDs). Forced 3× pad rejected.                                                                                                        |
| **2026-08-17** | **Remaining-work pass.** SAFE START docs mill closed. HOT HOLD over. NOW = five engines + human clicks. Sealed IDs archived. LIVE-LANES ghost LIVE rows removed. |

Historical mega board (do not execute): [`DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md`](DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md)
