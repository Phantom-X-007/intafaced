# TRK-market.commerce

**Title:** Listings, subscriptions, purchases, house commission  
**Tracker:** `market.commerce` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `market.vendors` (ready, **not done** — no svc-market)  
**Tip freeze:** `origin/main` @ `c6d9e89e`  
**Pack type:** research only.  
**Ownership:** Fiat Plane marketplace; not Shehzad M1–M7. Money paths still Class M when implemented.

## DoD (plain language)

A vetted vendor’s **listing** can be sold as one-time purchase or subscription; settlement is **ledger recipes** with a disclosed **house commission**; scopes `market:read` / `market:write` actually mean something. No balances in svc-market; no number money; no “success” without a posted recipe.

## Path on tip

| Area                  | Location                                                                          |
| --------------------- | --------------------------------------------------------------------------------- |
| Doctrine              | §8.7 svc-market · strategy marketplace notes § Vol additions                      |
| Module config         | `packages/config` → `svc-market` (named, **service absent**)                      |
| Scopes                | `packages/auth` — `market:read`/`write` labeled **“svc-market not built”**        |
| Stake gate (upstream) | `token.stakeOf` vendor slots — data ready for vendors row                         |
| Missing               | entire `services/svc-market/` · listings schema · commission recipes · vendor API |

**Tip residual:** **Greenfield.** Commerce cannot ship before `market.vendors` lifecycle (apply → vet → list). Pay service explicitly excludes commerce plugins as separate features.

## Blocked by

| Blocker            | Notes                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| **market.vendors** | Hard dep — no listings without vendor lifecycle                           |
| **Ledger recipes** | House commission = money movement (§0.6)                                  |
| Product taxonomy   | Eight vendor categories in doctrine — owner prioritisation                |
| Not Shehzad        | Unless listing is pure on-chain (out of scope for this row’s Fiat design) |

## First PR size (if free)

**Order:** (1) `market.vendors` service skeleton + stake slot check, (2) commerce listings + purchase recipe with commission split tests, (3) subscriptions as second PR. First commerce PR must include failure tests (vendor suspended, stake dropped, commission config missing → refuse). Research pack does not start code.
