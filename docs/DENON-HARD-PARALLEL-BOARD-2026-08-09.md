# Denon — remaining work (re-derived 2026-08-17)

**Audience:** `@Phantom-X-007` (Denon)  
**Status:** BINDING · **Rev:** **remaining-work pass · code-audit**  
**Tip at write:** `fdaf1a89` (`feat(svc-bank): addCollateral… #2245`)  
**Open PRs:** re-derive `gh pr list --state open` — mill **#2246 #2247 #2011 closed**. Keep **#2248** until merge. Shehzad **#1177**. Dependabot.

Companion: [`THREE-WAY-DISTRIBUTION-2026-08-04.md`](THREE-WAY-DISTRIBUTION-2026-08-04.md) · [`LIVE-LANES.md`](LIVE-LANES.md)  
Spec factory (done — do not re-write): [`SPEC-FACTORY-INDEX-2026-08-04.md`](SPEC-FACTORY-INDEX-2026-08-04.md)  
Owner packet (P0 already sealed/refuse): [`ops/owner-ruling-packet.json`](ops/owner-ruling-packet.json)

---

## 0 · Why this rewrite

The Aug 9 board was right _then_: HOT HOLD → SAFE START = P0 + P3/P4 docs. That wall is gone. Agents kept executing SAFE START. 17 Aug was a **law re-seal mill**.

The first remaining-work pass still listed five “engines.” **Code on tip already had four of them.** Tracker notes were the leak.

**This file now answers: what should be coded next.** Sealed IDs are an archive at the bottom. Do not reopen them as tickets.

---

## 1 · STOP (do not spawn)

| Pattern                                    | Status                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| D26-P0-01…18 docs/ADR recook               | **SEALED** (refuse-closed or named law). Magnitudes = owner click.                          |
| PKT-B5/B6/C7/C8/C9 / PAYOUT-01 docs recook | **SEALED** refuse or handoff.                                                               |
| D26-P3-01…11 runbooks                      | **LANDED** 15–17 Aug.                                                                       |
| D26-P4-01…09 ops/tracker protocol          | **LANDED** (this pass is the P4-09 honesty close).                                          |
| D26-P2-01 / P2-12 deepen                   | **LANDED.** **#2246 #2247 closed.**                                                         |
| Per-service `pass X into compose`          | **MILL.**                                                                                   |
| #2011 rewrite P2-04                        | **CLOSED** (duplicate of #1785).                                                            |
| **`pay.gateway` KYB consumer**             | **SHIPPED** — `merchantKybMoneyGateRefusal` on create/checkout/link/settle/new payout hold. |
| **D26-P1-P9 MemoryBroadcastStore**         | **SHIPPED** — `svc-pay` index.ts `new PostgresBroadcastStore(sql)`.                         |
| **Named leverage / silent 1×**             | **SHIPPED** — POST /positions 400 if leverage omitted.                                      |
| **WS empty-book honesty**                  | **SHIPPED** — `depth.engine_unavailable`. Do not recook `feat/ws-empty-book-*`.             |
| Shehzad #1177 implement                    | Babysit only.                                                                               |
| Vue / `nitro-frontend-all`                 | HUMAN.                                                                                      |
| Class X lists, secrets, go-live, counsel   | Nitro human.                                                                                |

**HOT HOLD is over.**

---

## 2 · NOW — code these (invent-risk · you)

Two product engines. Everything else in §3 is a click or a park.

| Order | ID / tracker                         | Remaining done bar                                                                                                                                                                                                                      | Why still you                |
| ----- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **1** | **D26-P1-X3 `execution.sor`**        | OMS/EMS on the thin `svc-execution` already on tip (house-tenant Stage-1). Cost model + 5 bps cap landed. Do not invent letter→bps. Do not point house at our book (P0-01). Arb/MM packages wait on this; do not start triangular mill. | Fake Done (“router exists”). |
| **2** | **`venue.aggregation` trading half** | Public MD adapters exist (binance + bybit). Trading half still `not_ready`. No live-network CI. Do not invent mids. Per-user keys are `connect.venue-vault` (**Shehzad socket**) — do not invent a vault.                               | Connect honesty.             |

**Do not start** `trade.futures` as a code mountain. Named 1× is shipped. Live re-leverage is deliberately 501. Funding/D3/profit-source are **owner numbers** (§3).

---

## 3 · NOW — human clicks (not agents, not ADRs)

| ID                            | What                                                                 | Why not a PR                                                                                              |
| ----------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **#2248**                     | Merge this remaining-work list                                       | Until it is on `origin/main`, cold agents load the old mill.                                              |
| **PKT-D10**                   | `act/pom.xml` rpc-common duplicate                                   | Unreviewed third-party; human edit                                                                        |
| **GH-G1 / G2 / G3**           | Branch protection / CODEOWNERS required / `allow_auto_merge`         | Admin clicks; agents must not PUT                                                                         |
| **GH-G5**                     | ZenYoda3 shared-identity frame                                       | Decision, not code                                                                                        |
| **Futures magnitudes**        | §8 funding/ceilings, D3 ladder, PKT-B5 profit-source account         | Packet already refuse-closed. Name **or** leave refuse. Do not write a third ADR. Do not recook named-1×. |
| **Academy prizes**            | IFC amounts for `academy.tournaments`                                | Refuse-closed until named.                                                                                |
| **`connect.data-lake` store** | TSDB pick                                                            | Capture honesty shipped. Do not choose a store in a PR.                                                   |
| **OTC §8**                    | spreads / stake / maxMidAgeSeconds                                   | Owner. Mechanism on tip.                                                                                  |
| **Class X**                   | Notify credentials, wallet secrets, sanctions list, licence, go-live | Nitro + counsel                                                                                           |

---

## 4 · Collision / ownership (unchanged)

| Not yours                                | Owner                                 |
| ---------------------------------------- | ------------------------------------- |
| Vendor shell / terminal UX               | `nitro-frontend-all`                  |
| Protocol / INTACHAIN / lending implement | `@shehzad002` (#1177 open)            |
| Venue Vault keys                         | `@shehzad002` (`connect.venue-vault`) |
| Class X content                          | Nitro human                           |
| §13 sockets as implement tickets         | Nobody                                |
| `pay.gateway` **rebuild** / second book  | Forbidden (leverage law)              |

Agents may residual-wire from tip on reclaimed pay/bank **except** the two NOW rows while you are coding them. Claim the row in LIVE-LANES first.

---

## 5 · Attack order (now)

1. Merge **#2248** (this file on `origin/main`).
2. **`svc-execution` OMS** on existing thin service — one PR.
3. **Venue trading half** only if you want live external place/cancel; otherwise leave `not_ready`. Vault stays Shehzad.
4. Name futures/academy/OTC magnitudes **or** leave refuse. No ADR.

---

## 6 · What Nitro agents keep

- Babysit Shehzad #1177
- Shell under `nitro-frontend-all` (HUMAN — they do not edit it)
- Reclaimed pay/bank **thin** from tip, path-disjoint from OMS / venue trading
- Implement **from sealed P0** once you land an engine (refuse-closed is the law)

**Agents must not:** take the two NOW engines · invent §8 · dual-edit your open files · close Class X · recook P0/P3/P4 · recook KYB / P9 / named-1× / empty-book / P2-01 deepen

---

## 7 · Sealed archive (do not reopen as tickets)

Proof is on `main`. This is not a backlog.

### P0 — owner law (sealed / refuse-closed)

P0-01 house desk · P0-02 §8 refuse · P0-03 dex venue refuse · P0-04 token authority · P0-05 options/forex freeze · P0-06 listing refuse-blank · P0-07 10× freeze · P0-08 pay grantor refuse · P0-09 fee recipe matrix · P0-10 commission refuse-blank · P0-11 scanner inputs · P0-12 attestation threat · P0-13 launchpad economics refuse · P0-14 mark dust keep-shipped · P0-15 copy geo refuse · P0-16 marketing-language ban · P0-17 empty insurance → no list · P0-18 packet index.

### P1 — engines already on tip (mechanism)

Futures T1a–g + named leverage on open · OTC RFQ+durable quotes · copy placeMirror · algo TWAP/VWAP/POV · ccxt matrix · mm-bot seed honesty · options/forex refuse-closed · pay PSP/PayFac/public-api/settlement/fraud/subscriptions-crypto · **KYB money-gate on pay doors** · **PostgresBroadcastStore at live boot** · bank earn/cards/ramps/loans · ops affiliates producer wire · market commerce refuse-blank · academy certs/curriculum/ambassadors refuse · Connect capture honesty + latency grade · Execution cost model + external arb/MM packages + house-tenant Stage-1 · WS empty-book vs matching-down.

**Not the same as tracker `done`.** Several rows stay `wip`/`ready` for live env, Vue, card socket, or owner numbers. That residual is section 2–3, not a docs ticket.

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
Start: svc-execution OMS  OR  venue trading half (if you want live external orders)
Do NOT start: P0 ADR, P3 runbook, P4 table, P2-01 deepen, compose pass-through, KYB consumer, BroadcastStore, named-1×, empty-book
```

---

## 9 · Changelog

| Date            | Change                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-09a     | v1 board: first substance handoff · ~47 IDs · SAFE START/HOT HOLD                                                                         |
| 2026-08-09b     | v2 mass thicken ~2.5× (~120 IDs). Forced 3× pad rejected.                                                                                 |
| **2026-08-17**  | **Remaining-work pass.** SAFE START docs mill closed. HOT HOLD over.                                                                      |
| **2026-08-17b** | **Code-audit.** KYB / P9 / named-1× / empty-book proven on tip. NOW = OMS + venue trading half. Mill PRs closed. Tracker notes corrected. |

Historical mega board (do not execute): [`DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md`](DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md)
