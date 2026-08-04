# LIVE LANES — multi-agent claims

**Rule:** No code edits until your lane is on this board (or `docs/ops/claims/<id>.md`). First claimer wins.  
**Law:** [`THREE-WAY-DISTRIBUTION-2026-08-04.md`](THREE-WAY-DISTRIBUTION-2026-08-04.md) · [`NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md`](NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md)  
**Truth layers:** [`COORDINATION-TRUTH-LAYERS.md`](COORDINATION-TRUTH-LAYERS.md)  
**Re-derive tip every fire:** `git fetch && git log -1 --oneline origin/main` · `gh pr list`

| Lane id                | Owner session      | Scope                                                                                                                                                                      | Status                     | PR / proof                              | Do not touch                                                                           |
| ---------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| shehzad-protocol-chain | shehzad002         | Protocol Plane + INTACHAIN only                                                                                                                                            | **HUMAN**                  | blockchain task board                   | agents implement protocol/chain/dex self-custody                                       |
| shehzad-346-handoff    | shehzad002 / nitro | Pay #346 finish **or** Nitro take residual                                                                                                                                 | **OPEN #346**              | handoff comment required                | dual-edit until handoff                                                                |
| denon-open-integrity   | Phantom-X-007      | His open integrity/money PRs                                                                                                                                               | **live**                   | `gh pr list` re-derive                  | dual-edit those file sets                                                              |
| nitro-ws-client        | Nitro (HUMAN)      | Shell depth/tape client per #727 — **landed #748**, absorbed into `nitro-frontend-all`                                                                                     | **HUMAN**                  | #748                                    | any front-end path (see `nitro-frontend-all`)                                          |
| nitro-reclaim-pay      | free after handoff | Pay OS residual Class M                                                                                                                                                    | blocked until #346 handoff | —                                       | #346 files while his                                                                   |
| nitro-reclaim-bank-id  | free / claim       | Bank thin + identity money graph                                                                                                                                           | free (reclaimed)           | tracker notes                           | invent balances                                                                        |
| nitro-frontend-all     | Nitro (HUMAN)      | **The whole front end** — both vendored Vue trees (shell `:8090` + staff console), `apps/web`, `apps/admin`, `packages/ui`, `packages/i18n`; exact paths in the claim file | **HUMAN**                  | `docs/ops/claims/NITRO-FRONTEND-ALL.md` | agents edit **no** file under those six paths — craft, polish, rebrand, tests included |
| ~~stream-a-ui~~        | —                  | Vendor shell :8090 craft residual                                                                                                                                          | **CLOSED**                 | —                                       | absorbed into `nitro-frontend-all`                                                     |
| afk-residual           | residual-own       | AFK shell wave                                                                                                                                                             | **drained** freeProduct=0  | residual-register                       | re-open only new invent residual                                                       |
| launch-flags           | this session       | `LAUNCH_DROP` flag honesty — `packages/config` enforcement + `apps/admin` console                                                                                          | **OPEN #436**              | #436                                    | `services/svc-edge` · the console freeze path (#447 landed)                            |

## Free agent work (re-derive every fire)

1. ~~**A-WS-CLIENT**~~ — landed #748. Front-end work is **not free**: `nitro-frontend-all` is a HUMAN lane.
2. **P1 stranded** — path-clean `origin/feat/*` land, **backend only** (no path in the front-end claim).
3. **P2 babysit** — Denon open + #346 comment only; never merge partners.
4. **Reclaimed mountains** — pay (after handoff), bank, identity money, trade-light; never invent mids.
5. _*Denon hard board (mega + D-S-* spec factory)_* — babysit only: [`DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md`](DENON-HARD-TASK-BOARD-FROM-NITRO-SWARM-2026-08-03.md).
6. **Shehzad chain** — never implement: [`SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`](SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md).

**Not free:** Shehzad protocol/chain implement · dual-edit Denon open files · invent money/depth · Class X · platform-pages dual-start without foundation/craft split.

## Last board update

- **2026-08-04 three-way distribution:** Shehzad chain-only; M1/M3–M7 reclaimed for agents; #346 handoff lane; Denon hard queue refreshed.
- **2026-08-04 one-surface closure:** whole front end claimed HUMAN (`nitro-frontend-all`); `stream-a-ui` closed; doctrine §5.3 repointed off `apps/web`; the `web` service and its `3000:3000` door removed from compose; ONE SURFACE rule added to `docs/ops/SWARM-MANDATE.md`.
