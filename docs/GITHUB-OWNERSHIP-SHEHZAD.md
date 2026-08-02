# GitHub ownership lock — `@shehzad002` (Shehzad / “sheezad”)

**Status:** BINDING on `main` · cold agents must obey  
**Detail backlog:** [`SHEHZAD-HARD-OWNERSHIP-2026-08-01.md`](SHEHZAD-HARD-OWNERSHIP-2026-08-01.md)  
**Live claims:** [`LIVE-LANES.md`](LIVE-LANES.md)  
**Scoreboard:** [`BOARD-CLEAR-SCOREBOARD.md`](BOARD-CLEAR-SCOREBOARD.md)

---

## What “ownership on GitHub” means here

GitHub does **not** have a single “this human owns the module” switch. On this repo, ownership is **enforced for agents and humans** by stacking:

| Layer                                               | What it does                                                                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **This file + SHEHZAD-HARD-OWNERSHIP + LIVE-LANES** | Law for agents: **do not implement** his mountains                                                                                      |
| **`AGENTS.md` + session paste**                     | Every cold chat sees the ban in the entry chain                                                                                         |
| **Tracker `owner: shehzad002`**                     | Scoreboard / `pnpm tracker` shows who owns the feature                                                                                  |
| **`.github/CODEOWNERS`**                            | GitHub **auto-requests review** from him on his paths (review request, not a hard merge block unless branch protection requires owners) |
| **Open PRs by him**                                 | Live WIP (e.g. pay M1) — babysit only                                                                                                   |

If any layer lags, **LIVE-LANES HUMAN-CLAIMED + this file win** for “who may code.”

---

## His mountains (never agent-implement)

| ID     | Mountain                | Primary paths / tracker                                                                                   |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| **M1** | Pay OS                  | `services/svc-pay/**` · `pay.gateway` + pay.\* expand                                                     |
| **M2** | Protocol OS             | `services/svc-protocol/**` · smart-accounts, amm, lending, escrow, router, merchant                       |
| **M3** | Futures risk            | `trade.futures` risk/margin/liq (not shell charts)                                                        |
| **M4** | OTC / copy / algo       | `trade.otc` · `trade.copy` · `trade.algo`                                                                 |
| **M5** | Identity money graph    | sub-accounts / money routing · `identity.apikeys` (sub-accounts half) · related identity money gates      |
| **M6** | Bank money              | `bank.earn` · `bank.cards` · `bank.ramps` · `bank.sovereign-card` · `services/svc-bank/**` money products |
| **M7** | Java dual-book residual | vendor Java money doors (after #289)                                                                      |

**Agents may:** comment on his PRs, CI babysit, **never** open competing implement PRs on those paths unless he comments `agents free on <path>`.

---

## What agents still own (safe to cook)

P-UI vendor shell `:8090` · P-TRADE-LIGHT (mm residual / spot OHLCV / venue) · P-WS · P-P5-LIGHT academy/ops · P-TRACK · Board Clear coord · ledger/core not listed above.

---

## Cold-agent checklist (every session)

```
1) git fetch && gh pr list --state open
2) Read docs/LIVE-LANES.md — skip any HUMAN-CLAIMED / M1–M7 row
3) Read docs/GITHUB-OWNERSHIP-SHEHZAD.md (this file) if coding near pay/protocol/trade/bank/identity
4) If path is under his CODEOWNERS lines → do not implement; babysit only
5) Never mark tracker done on his rows without his proof
```

---

## Nitro unspoken needs (hardened)

1. You can keep building forever **without colliding** with Shehzad.
2. Chat memory is **not** ownership — **main tip is**.
3. “I checked GitHub” must show the same ban as this file.
4. Agents that only read tracker must see **owner shehzad002**, not stale Nitro.
5. Speed is fine on **agent** lanes; stealing his money mountains is not.

_Update this file only with a PR that also updates LIVE-LANES if claims change._
