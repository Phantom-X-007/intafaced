# LIVE LANES — multi-agent claims

**Rule:** No code edits until your lane is on this board (or `docs/ops/claims/<id>.md`). First claimer wins.  
**Law:** [`THREE-WAY-DISTRIBUTION-2026-08-04.md`](THREE-WAY-DISTRIBUTION-2026-08-04.md) · [`NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md`](NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md)  
**Truth layers:** [`COORDINATION-TRUTH-LAYERS.md`](COORDINATION-TRUTH-LAYERS.md)  
**Re-derive tip every fire:** `git fetch && git log -1 --oneline origin/main` · `gh pr list --state open`

**2026-08-17 remaining-work pass (code-audit):** KYB consumer, PostgresBroadcastStore, named futures leverage, and WS empty-book honesty are **on tip**. Do not recook them. Remaining Denon **code** is OMS + venue trading half. Board: [`DENON-HARD-PARALLEL-BOARD-2026-08-09.md`](DENON-HARD-PARALLEL-BOARD-2026-08-09.md).

<!-- prettier-ignore -->
| Lane id | Owner session | Scope | Status | PR / proof | Do not touch |
| --- | --- | --- | --- | --- | --- |
| denon-d26-remaining-work | Phantom-X-007 | D26-P4-09 board honesty — lists match tip; mill PRs closed; remaining = OMS + venue trading half + owner clicks | **LIVE** | docs/d26-remaining-work-board · #2248 | invent rates · flip tracker done · Vue · Shehzad chain |
| denon-hard-parallel | Phantom-X-007 | Invent-risk **code** left: `execution.sor` OMS/EMS · `venue.aggregation` trading half. P0/P3/P4 mill **closed**. KYB / P9 / named-1× / empty-book **shipped**. | **LIVE** | [`DENON-HARD-PARALLEL-BOARD-2026-08-09.md`](DENON-HARD-PARALLEL-BOARD-2026-08-09.md) | KYB recook · BroadcastStore recook · P2-01 deepen · compose-env mill |
| denon-open-integrity | Phantom-X-007 | Open Denon PRs — re-derive `gh pr list --author Phantom-X-007 --state open`. Mill **#2246 #2247 #2011 closed**. Keep **#2248** until merge. | **live** | #2248 | dual-edit mill branches |
| shehzad-protocol-chain | shehzad002 | Protocol Plane + INTACHAIN only | **HUMAN** | blockchain task board | agents implement protocol/chain/dex self-custody |
| shehzad-346-handoff | nitro (asserted) | Pay residual after operator handoff | **HANDOFF ASSERTED 2026-08-04** | #346 comment + this row | dual-edit **his branch** still; residual from **tip** |
| nitro-frontend-all | Nitro (HUMAN) | The whole front end — both vendored Vue trees (shell `:8090` + staff console), `apps/web`, `apps/admin`, `packages/ui`, `packages/i18n` | **HUMAN** | `docs/ops/claims/NITRO-FRONTEND-ALL.md` | agents edit **no** file under those six paths |
| nitro-ws-client | Nitro (HUMAN) | Shell depth/tape client — landed #748, absorbed into `nitro-frontend-all` | **HUMAN** | #748 | any front-end path |
| nitro-reclaim-pay | free / claim | Pay OS residual Class M from tip — KYB money-gate **shipped**; card stays `socket.psp-partners` | **free** | tip | dual-edit shehzad `feat/pay-os-m1-gateway` · invent PSP |
| nitro-reclaim-bank-id | free / claim | Bank thin + identity money graph | **free** | tracker notes | invent balances |
| ~~stream-a-ui~~ | — | Vendor shell :8090 craft residual | **CLOSED** | — | absorbed into `nitro-frontend-all` |

## Stop (token mill — do not spawn)

| Pattern                                         | Why                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| D26-P0-\* / PKT-\* **docs/ADR re-seal**         | Law already refuse-closed on tip. Magnitudes are owner click, not another ADR. |
| D26-P3-\* runbooks / D26-P4-\* ops tables       | Landed 2026-08-15–17. Recooking them is the spend leak.                        |
| D26-P2-01 / P2-12 “deepen spine reprove”        | Matching/ledger/identity doors already re-proved. **#2246 #2247 closed.**      |
| `pay.gateway` KYB consumer                      | **Shipped** (`merchantKybMoneyGateRefusal` on money doors).                    |
| D26-P1-P9 MemoryBroadcastStore                  | **Shipped** — live boot wires `PostgresBroadcastStore`.                        |
| Named leverage / silent 1×                      | **Shipped** — POST /positions 400 without leverage.                            |
| `feat/ws-empty-book-*`                          | **Shipped** — `depth.engine_unavailable` on tip.                               |
| `pass X into compose` per-service mill          | Wiring mill, not product.                                                      |
| Ghost **LIVE** rows / stale `docs/ops/claims/*` | This file is claims for _this hour_, not a merge archive.                      |

## Free agent work (re-derive every fire)

1. Front-end is **not free** (`nitro-frontend-all` HUMAN).
2. **P1 stranded** — path-clean `origin/feat/*` land, **backend only**.
3. **P2 babysit** — Shehzad **#1177** only. Dependabot is not Denon mill.
4. **Reclaimed mountains** — pay/bank/identity thin from tip; never invent mids; never dual-edit #346 branch.
5. **Denon remaining code** — **not agent invent-risk.** Babysit OMS + venue trading half unless he hands a named residual.
6. **Shehzad chain** — never implement: [`SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`](SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md).

**Not free:** Shehzad protocol/chain implement · dual-edit Denon open files · Denon invent-risk engines · invent money/depth · Class X · front-end under `nitro-frontend-all` · P0/P3/P4 docs recook · KYB / P9 / named-1× / empty-book recook.

## Last board update

- **2026-08-17 Denon remaining-work pass (code-audit):** closed mill PRs #2246 #2247 #2011. Tip at write: `fdaf1a89`. Open: **#2248** (this list), **#1177** Shehzad, Dependabot. Stale tracker notes (KYB has no consumer / Memory-only / silent 1× / empty-book not done) corrected in `features.mjs`.
