# Spec factory index — D-S-01…18, what exists and what is genuinely blank

**Written by:** Denon, 2026-08-04. **Status:** authoritative index for the D-S board.
**The board it indexes:** [`DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md`](DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md) §3, lines 64–83.

---

## Why this file exists

**Seven of the eighteen spec slots were already satisfied by documents merged on 1–2 August, and no board cited them.** The 2026-08-03 board was written without them, so agents have been waiting on specs that were on `main` the whole time.

A `grep` across `DENON-HARD-TASK-BOARD`, `THREE-WAY-DISTRIBUTION`, `LIVE-LANES`, `INTERNET-LEVERAGE`, `REGROUP` and `AGENTS.md` for `SPEC-LENDING|SPEC-OTC|SPEC-PAY-VERTICALS|SPEC-SOVEREIGN|SPEC-SUBACCOUNTS` returns **zero hits**. Only `DIRECTION-2026-07-31.md`, `SHEHZAD-BLOCKCHAIN-TASK-BOARD` and `TRACKER.md` link them.

That is the whole failure: **the work was done and the pointer was missing.** This file is the pointer.

---

## The index

| ID            | Status      | Where the law lives                                                                                                                                                            |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D-S-01** ⚠️ | **partial** | `DIRECTION-2026-07-31.md` §1 — isolated margin only, partial-liquidation posture, MVP done bar. **No ADR.** Mark/funding law still blank.                                      |
| **D-S-02** ✅ | **done**    | [`SPEC-OTC-RFQ-AND-EARN-2026-08-02.md`](SPEC-OTC-RFQ-AND-EARN-2026-08-02.md) Part A                                                                                            |
| **D-S-03** ✅ | **done**    | [`SPEC-SOVEREIGN-ROUTING-AND-COPY-2026-08-01.md`](SPEC-SOVEREIGN-ROUTING-AND-COPY-2026-08-01.md). `DIRECTION` §1 marks the old ban superseded by it.                           |
| **D-S-04** ✅ | **done**    | [`adr/2026-08-04-algo-execution-law.md`](adr/2026-08-04-algo-execution-law.md), on `DIRECTION` §1 (TWAP only, icebergs out).                                                   |
| **D-S-05** ✅ | **done**    | [`adr/2026-08-04-instrument-enum-authority.md`](adr/2026-08-04-instrument-enum-authority.md) on `DIRECTION` §2.                                                                |
| **D-S-06** ❌ | **blank**   | Nothing anywhere. **Highest agent-unblock value of the blanks.** Needs the fill-finality answer first.                                                                         |
| **D-S-07** ⚠️ | **half**    | [`SPEC-LENDING-2026-08-02.md`](SPEC-LENDING-2026-08-02.md) §1 for lending. Futures mark side blank — see D-S-01.                                                               |
| **D-S-08** ❌ | **blank**   | PR #428 open. No spec.                                                                                                                                                         |
| **D-S-09** ✅ | **done**    | Earn half: `SPEC-OTC-RFQ-AND-EARN` Part B + `DIRECTION` §7. Cards/ramps §13 boundary: [`adr/2026-08-04-bank-vertical-law.md`](adr/2026-08-04-bank-vertical-law.md)             |
| **D-S-10** ✅ | **done**    | [`SPEC-PAY-VERTICALS-2026-08-02.md`](SPEC-PAY-VERTICALS-2026-08-02.md) + [`adr/2026-08-04-pay-rails-and-psp-socket.md`](adr/2026-08-04-pay-rails-and-psp-socket.md)            |
| **D-S-11** ✅ | **done**    | [`SPEC-SUBACCOUNTS-2026-08-02.md`](SPEC-SUBACCOUNTS-2026-08-02.md). Adjacent: [`adr/2026-08-04-authority-and-refusal-shape.md`](adr/2026-08-04-authority-and-refusal-shape.md) |
| **D-S-12** ✅ | **done**    | [`adr/2026-08-04-cross-plane-bridge-accounting.md`](adr/2026-08-04-cross-plane-bridge-accounting.md) — accounting law only; chain side is Shehzad S-D7/S-B5.                   |
| **D-S-13** ✅ | **done**    | [`adr/2026-08-04-event-socket-vs-broken-promise.md`](adr/2026-08-04-event-socket-vs-broken-promise.md)                                                                         |
| **D-S-14** ✅ | **done**    | [`adr/2026-08-04-token-economics-outcomes.md`](adr/2026-08-04-token-economics-outcomes.md) — decides no number; decides whose they are.                                        |
| **D-S-15** ✅ | **done**    | [`adr/2026-08-04-platform-pages-ia.md`](adr/2026-08-04-platform-pages-ia.md) — law only, craft stays Nitro.                                                                    |
| **D-S-16** ✅ | **done**    | [`adr/2026-08-04-class-m-hold-language.md`](adr/2026-08-04-class-m-hold-language.md) on `DIRECTION` §3.                                                                        |
| **D-S-17** ✅ | **done**    | Decision: `DIRECTION` §4 (Option B). Residual: [`adr/2026-08-04-java-dual-book-residual.md`](adr/2026-08-04-java-dual-book-residual.md)                                        |
| **D-S-18** ❌ | **blank**   | Board itself says "if in scope".                                                                                                                                               |

**Tally: 13 done · 2 partial · 3 blank.** The board read as 17 blank.

---

## What this changes for agents, today

**Agents may now implement against D-S-02, 03, 04, 05, 09, 10, 11, 12, 13, 14, 15, 16 and 17 without waiting.** Those thirteen are law on `main`. The "blocked on Denon" label on them was wrong and is withdrawn.

**D-S-01 and 07 are partially law.** Implement the decided part; do not invent the rest. Each row above names which half is which.

**D-S-06, 08 and 18 remain genuinely blank.** D-S-06 needs the fill-finality answer; D-S-08 needs the escrow-plane conflict ruled. The invent-ban holds in full. Research is welcome; implementation is not.

---

## Two things this index does not fix

**`D-S-02`, `03`, `09`, `10`, `11` being law does not mean the numbers are decided.** `DIRECTION-2026-07-31.md` §8 is a live ten-item owner-only list — `leader_share_bps`, every fee-share rate, the copy jurisdiction list. **Copy trading's shape is specced and its rates are not**, so D-S-03 unblocks the mechanism and not the launch. Same pattern elsewhere: a spec that says "disclose the spread" does not say what the spread is.

**Roughly twelve owner-gated product decisions have no D-S number at all**, so nothing tracks them: launchpad raise economics, chain governance parameters, consensus params, slash percentages, forex PnL settlement asset, fee/listings/treasury law, scanner signal inputs, attestation threat model, plus `market.vendors`, `mining.pool`, `trade.options`, `trade.ccxt-api`, `venue.aggregation`, `market.commerce`. They sit in `docs/ops/trk/*` naming Denon as blocker with no board row pointing at them.

The sharpest of these: **`dex.quote-router` is finished code that cannot serve a quote**, because `socket.dex-venue-set` records that nobody has decided which venue this platform quotes. One sentence ships a completed service.

---

## Maintaining this file

When a D-S slot moves, edit this table in the same commit. An index that lags is worse than none — the seven-slot gap above exists precisely because the board and the specs were updated in different commits by different people, and neither noticed.
