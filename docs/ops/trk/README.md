# Tracker research pack — TRK specs

**Night-engine research** (no implement swarm). One short spec per free tracker
row so ship later is planned, not invented mid-PR.

| Field           | Meaning                                                            |
| --------------- | ------------------------------------------------------------------ |
| **DoD (plain)** | What “done” means for Nitro without code                           |
| **Path on tip** | Service / package / app that owns residual                         |
| **Blocked by**  | Money spine, Denon product law, Class X, unknown, or free residual |
| **First PR**    | Smallest honest first slice if ever free to implement              |

**Law:** Class N docs. Implement only after LIVE-LANES claim + tracker mountain
event when someone actually ships. Human-claimed Shehzad M1–M7 remain babysit
only. Research packs **do not** edit `tooling/tracker/features.mjs`.

---

## Pack 2 — `docs/trk-research-pack-2` (tip freeze `c773dafa`)

Re-verify + **blueprint.card** add. Same free rows as pack 1 where still
`ready` / unowned, plus Blueprint share-card residual. Prefer these files over
older tip freezes when planning implement.

| Id                   | Title                                          | Spec                                             |
| -------------------- | ---------------------------------------------- | ------------------------------------------------ |
| `ops.admin`          | Operator console — live control plane residual | [ops.admin.md](./ops.admin.md)                   |
| `infra.i18n`         | Surfaces keyed; catalogs beyond English        | [infra.i18n.md](./infra.i18n.md)                 |
| `ops.notifications`  | Out-of-app channels actually deliver           | [ops.notifications.md](./ops.notifications.md)   |
| `ops.support`        | Support desk, tickets, KB                      | [ops.support.md](./ops.support.md)               |
| `agents.support`     | Support agent on gateway runtime               | [agents.support.md](./agents.support.md)         |
| `academy.curriculum` | Full library vs day-one spine                  | [academy.curriculum.md](./academy.curriculum.md) |
| `dex.quote-router`   | Live cross-venue quote or typed refusal        | [dex.quote-router.md](./dex.quote-router.md)     |
| `trade.ccxt-api`     | Bot REST residual (candles, futures toggles)   | [trade.ccxt-api.md](./trade.ccxt-api.md)         |
| `blueprint.card`     | Share card SVG done; PNG rail residual         | [blueprint.card.md](./blueprint.card.md)         |

**Pack 2 deltas vs pack 1:**

- Added `blueprint.card` (SVG compose done; `BLUEPRINT_CARD_RENDERER_URL` rail).
- `trade.ccxt-api`: leverage/margin routes are **typed unsupported**, not absent;
  OHLCV aggregates live fills (materialize job still optional/OFF).
- `ops.admin`: tracker “zero tests / pure useState” note remains **stale** on tip.

---

## Pack 1 — `docs/night-trk-research-pack-1` (merged earlier)

Historical index of first eight free-row specs (same unprefixed filenames). Tip
freeze at open of that branch; pack 2 re-freeze supersedes for implement planning.

| Id                   | Spec                                             |
| -------------------- | ------------------------------------------------ |
| `ops.admin`          | [ops.admin.md](./ops.admin.md)                   |
| `infra.i18n`         | [infra.i18n.md](./infra.i18n.md)                 |
| `ops.notifications`  | [ops.notifications.md](./ops.notifications.md)   |
| `ops.support`        | [ops.support.md](./ops.support.md)               |
| `agents.support`     | [agents.support.md](./agents.support.md)         |
| `academy.curriculum` | [academy.curriculum.md](./academy.curriculum.md) |
| `dex.quote-router`   | [dex.quote-router.md](./dex.quote-router.md)     |
| `trade.ccxt-api`     | [trade.ccxt-api.md](./trade.ccxt-api.md)         |

**Long-form sisters** (ops-packs wave, same ids): `TRK-ops.admin.md`,
`TRK-ops.notifications.md`, `TRK-infra.i18n.md` — deeper stage tables; keep if
useful, do not fork implement plans from conflicting freezes.

---

## Not packed yet (still free, lower priority or heavier blockers)

chain.\*, launch.\*, mining.pool, trade.options/forex, ops.affiliates (payout
money), ops.analytics warehouse, blueprint.attestations / blueprint.ownership
cascade half, market.\*, agents.scanner product law, venue.aggregation trading
half, p2p.merchants, ops.compliance (counsel list Class X content),
agents.navigator / merchant / copy-intel product registration.
