# LIVE LANES — multi-agent claims

**Rule:** No code edits until your lane is on this board (or `docs/ops/claims/<id>.md`). First claimer wins.  
**Law:** [`THREE-WAY-DISTRIBUTION-2026-08-04.md`](THREE-WAY-DISTRIBUTION-2026-08-04.md) · [`NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md`](NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md)  
**Truth layers:** [`COORDINATION-TRUTH-LAYERS.md`](COORDINATION-TRUTH-LAYERS.md)  
**Re-derive tip every fire:** `git fetch && git log -1 --oneline origin/main` · `gh pr list`

| Lane id                | Owner session    | Scope                                                                                                         | Status                          | PR / proof                              | Do not touch                                                                                                                                                             |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| shehzad-protocol-chain | shehzad002       | Protocol Plane + INTACHAIN only                                                                               | **HUMAN**                       | blockchain task board                   | agents implement protocol/chain/dex self-custody                                                                                                                         |
| shehzad-346-handoff    | nitro (asserted) | Pay residual after operator handoff                                                                           | **HANDOFF ASSERTED 2026-08-04** | #346 comment + this row                 | dual-edit **his branch** still; residual from **tip**                                                                                                                    |
| denon-open-integrity   | Phantom-X-007    | His open integrity/money PRs                                                                                  | **live**                        | `gh pr list` re-derive                  | dual-edit those file sets                                                                                                                                                |
| nitro-ws-client        | Nitro (HUMAN)    | Shell depth/tape client per #727 — **landed #748**, absorbed into `nitro-frontend-all`                        | **HUMAN**                       | #748                                    | any front-end path (see `nitro-frontend-all`)                                                                                                                            |
| nitro-reclaim-pay      | free / claim     | Pay OS residual Class M (from tip)                                                                            | **free**                        | tip + #226 crypto rail                  | dual-edit shehzad `feat/pay-os-m1-gateway`                                                                                                                               |
| nitro-reclaim-bank-id  | free / claim     | Bank thin + identity money graph                                                                              | free (reclaimed)                | tracker notes                           | invent balances                                                                                                                                                          |
| nitro-frontend-all     | nitro-afk-agents | **The whole front end** — honesty / money-on-wire / wire / landing only for 24h AFK day; exact paths in claim | **agent-afk-day**               | `docs/ops/claims/NITRO-FRONTEND-ALL.md` | NO palette re-pick · NO IA redesign · NO invent prices · dual-edit partner PRs still banned                                                                              |
| ~~stream-a-ui~~        | —                | Vendor shell :8090 craft residual                                                                             | **CLOSED**                      | —                                       | absorbed into `nitro-frontend-all`                                                                                                                                       |
| afk-residual           | residual-own     | AFK shell wave                                                                                                | **drained** freeProduct=0       | residual-register                       | re-open only new invent residual                                                                                                                                         |
| launch-flags           | this session     | `LAUNCH_DROP` flag honesty — `packages/config` enforcement + `apps/admin` console                             | **OPEN #436**                   | #436                                    | `services/svc-edge` · the console freeze path (#447 landed)                                                                                                              |
| board-honesty-phantom  | this session     | Phantom svc-pay lock in `tooling/ci` (D-S-16) + `p2p.disputes` row honesty (D-S-08) — **that row only**       | **live**                        | this PR                                 | any other `features.mjs` row — #346 holds `pay.gateway`, #877 holds the bank rows · `services/svc-pay/**` · implementing the `p2p:moderate` scope split (owner sign-off) |

## Free agent work (re-derive every fire)

1. ~~**A-WS-CLIENT**~~ — landed #748. Front-end: **agent-afk-day** (2026-08-05) — honesty / money-on-wire only; Nitro may reclaim HUMAN.
2. **P1 stranded** — path-clean `origin/feat/*` land, **backend only** (no path in the front-end claim).
3. **P2 babysit** — Denon open; never merge partners.
4. **Reclaimed mountains** — pay (handoff asserted), bank, identity money, trade-light; never invent mids; never dual-edit #346 branch.
5. **Denon hard board (mega + D-S-\* spec factory)** — babysit only: [`DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md`](DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md).
6. **Shehzad chain** — never implement: [`SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`](SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md).

**Not free:** Shehzad protocol/chain implement · dual-edit Denon open files · invent money/depth · Class X · FE craft outside AFK honesty scope · platform-pages dual-start without foundation/craft split.

## Last board update

- **2026-08-04 three-way distribution:** Shehzad chain-only; M1/M3–M7 reclaimed for agents; Denon hard queue refreshed.
- **2026-08-04 one-surface closure:** whole front end claimed HUMAN (`nitro-frontend-all`); `stream-a-ui` closed; doctrine §5.3 repointed off `apps/web`; the `web` service and its `3000:3000` door removed from compose; ONE SURFACE rule added to `docs/ops/SWARM-MANDATE.md`.
- **2026-08-04 #346 handoff asserted (operator):** Nitro residual from tip; do not dual-edit his open pay branch; Shizu = Protocol/INTACHAIN only.

- **2026-08-05 AFK day FE release:** `nitro-frontend-all` → **agent-afk-day** for 24h honesty craft (Nitro directive). Not a permanent unlock.
