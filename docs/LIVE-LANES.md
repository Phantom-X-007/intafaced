# LIVE LANES — multi-agent claims

**Rule:** No code edits until your lane is on this board (or `docs/ops/claims/<id>.md`). First claimer wins.  
**Law:** [`THREE-WAY-DISTRIBUTION-2026-08-04.md`](THREE-WAY-DISTRIBUTION-2026-08-04.md) · [`NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md`](NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md)  
**Truth layers:** [`COORDINATION-TRUTH-LAYERS.md`](COORDINATION-TRUTH-LAYERS.md)  
**Re-derive tip every fire:** `git fetch && git log -1 --oneline origin/main` · `gh pr list --state open`

**2026-08-17 remaining-work pass:** every Denon P0/P3/P4 docs lane that was still marked **LIVE** had already landed on tip. Those rows are gone. Do not recook them. Remaining Denon work lives on [`DENON-HARD-PARALLEL-BOARD-2026-08-09.md`](DENON-HARD-PARALLEL-BOARD-2026-08-09.md) (remaining section first).

<!-- prettier-ignore -->
| Lane id | Owner session | Scope | Status | PR / proof | Do not touch |
| --- | --- | --- | --- | --- | --- |
| denon-d26-remaining-work | Phantom-X-007 | D26-P4-09 board honesty — LIVE-LANES + Denon hard board match tip; remaining engines only; no P0 re-seal | **LIVE** | docs/d26-remaining-work-board | invent rates · flip tracker done · Vue · Shehzad chain |
| denon-hard-parallel | Phantom-X-007 | Remaining invent-risk engines only (futures umbrella, pay.gateway KYB consumer, svc-execution OMS, venue trading half, durable BroadcastStore). P0/P3/P4 docs mill **closed**. | **LIVE** | [`DENON-HARD-PARALLEL-BOARD-2026-08-09.md`](DENON-HARD-PARALLEL-BOARD-2026-08-09.md) | P0/P3/P4 re-seal ADRs · P2-12 deepen · compose-env mill · dual-edit #2011 |
| denon-open-integrity | Phantom-X-007 | Open Denon PRs — re-derive `gh pr list --author Phantom-X-007 --state open`. Today: **#2011** docs fleet-image (duplicate of landed #1785 — close, do not recook). | **live** | #2011 | dual-edit that file set · rewrite P2-04 runbook |
| shehzad-protocol-chain | shehzad002 | Protocol Plane + INTACHAIN only | **HUMAN** | blockchain task board | agents implement protocol/chain/dex self-custody |
| shehzad-346-handoff | nitro (asserted) | Pay residual after operator handoff | **HANDOFF ASSERTED 2026-08-04** | #346 comment + this row | dual-edit **his branch** still; residual from **tip** |
| nitro-frontend-all | Nitro (HUMAN) | The whole front end — both vendored Vue trees (shell `:8090` + staff console), `apps/web`, `apps/admin`, `packages/ui`, `packages/i18n` | **HUMAN** | `docs/ops/claims/NITRO-FRONTEND-ALL.md` | agents edit **no** file under those six paths |
| nitro-ws-client | Nitro (HUMAN) | Shell depth/tape client — landed #748, absorbed into `nitro-frontend-all` | **HUMAN** | #748 | any front-end path |
| nitro-reclaim-pay | free / claim | Pay OS residual Class M from tip — KYB money-gate is Denon remaining, not a second gateway rebuild | **free** | tip | dual-edit shehzad `feat/pay-os-m1-gateway` · invent PSP |
| nitro-reclaim-bank-id | free / claim | Bank thin + identity money graph | **free** | tracker notes | invent balances |
| ~~stream-a-ui~~ | — | Vendor shell :8090 craft residual | **CLOSED** | — | absorbed into `nitro-frontend-all` |

## Stop (token mill — do not spawn)

| Pattern                                 | Why                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| D26-P0-* / PKT-* **docs/ADR re-seal**   | Law already refuse-closed on tip. Magnitudes are owner click, not another ADR. |
| D26-P3-* runbooks / D26-P4-* ops tables | Landed 2026-08-15–17. Recooking them is the spend leak.                        |
| D26-P2-12 “deepen spine reprove”        | Matching/ledger/identity doors already re-proved.                              |
| `pass X into compose` per-service mill  | Wiring mill, not product.                                                      |
| Ghost **LIVE** rows for merged PRs      | This file is claims for _this hour_, not a merge archive.                      |

## Free agent work (re-derive every fire)

1. Front-end is **not free** (`nitro-frontend-all` HUMAN).
2. **P1 stranded** — path-clean `origin/feat/*` land, **backend only**.
3. **P2 babysit** — Denon open; never merge partners. Today that is #2011 (close) + Shehzad #1177 (babysit).
4. **Reclaimed mountains** — pay/bank/identity thin from tip; never invent mids; never dual-edit #346 branch. `pay.gateway` KYB consumer is on the Denon remaining board — coordinate, do not steal if he is coding it.
5. **Denon remaining engines** — **not agent invent-risk.** Babysit only unless he hands a named residual. Board: [`DENON-HARD-PARALLEL-BOARD-2026-08-09.md`](DENON-HARD-PARALLEL-BOARD-2026-08-09.md).
6. **Shehzad chain** — never implement: [`SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`](SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md).

**Not free:** Shehzad protocol/chain implement · dual-edit Denon open files · Denon invent-risk engines · invent money/depth · Class X · front-end under `nitro-frontend-all` · P0/P3/P4 docs recook.

## Last board update

- **2026-08-17 Denon remaining-work pass:** collapsed LIVE-LANES. Ghost LIVE docs lanes (P0/P3/P4) removed. `denon-hard-parallel` now means remaining engines, not the Aug 9 SAFE START mill. Claim `denon-d26-remaining-work` for this file + the board rewrite. Tip at write: `fdaf1a89` (#2245 on main). Open: #2011 (close), #1177 Shehzad, Dependabot.
