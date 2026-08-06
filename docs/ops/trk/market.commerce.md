# TRK-market.commerce — research / spec pack

**Tracker id:** `market.commerce`  
**Title:** Listings, subscriptions, purchases, house commission  
**Module / phase:** `market` · phase 5 · plane **F**  
**Status on tip:** `ready` · **owner:** none  
**Depends on:** `market.vendors` (ready, **not done** — no `svc-market`)  
**Tip freeze:** `origin/main` @ `c7af0849` (re-derive before implement)  
**Pack type:** research only. Fiat Plane marketplace — **not** Shehzad M1–M7. Money paths **Class M** when implemented.

---

## 1 · What “done” means (plain language)

1. A vetted vendor’s **listing** can be sold as one-time purchase or subscription.
2. Settlement is **ledger recipes** with a disclosed **house commission**.
3. Scopes `market:read` / `market:write` actually authorize market APIs (today labeled **svc-market not built**).
4. No balances in `svc-market`; no money-as-`number`; no “success” without a posted recipe.
5. Fail closed: vendor suspended, stake dropped, commission config missing → refuse sale.

---

## 2 · Current code state (tip)

### 2.1 Service absent — greenfield

| Fact                   | Tip                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `services/svc-market/` | **Does not exist**                                                                                         |
| Config                 | `packages/config/src/modules.ts` — `market` → `svc-market`, fiat, phase 5, custodial: true                 |
| Auth scopes            | `packages/auth/src/scopes.ts` — `market:read` / `market:write` with description **'svc-market not built'** |
| Scope implication      | `market:write` implies `market:read`                                                                       |
| Listings schema        | None                                                                                                       |
| Commission recipes     | None under `packages/ledger-client/src/recipes/` (only bank/loans patterns today as named recipes)         |

### 2.2 Upstream vendors (hard dep)

| Piece                    | Tip                                                                             |
| ------------------------ | ------------------------------------------------------------------------------- |
| `market.vendors`         | Ready; research pack `TRK-market.vendors.md`                                    |
| Stake-gated vendor slots | Data in `services/svc-token/.../staking.ts` — `vendorSlots` 0/1/3/10/50 by tier |
| Vendor lifecycle code    | **None** — apply/vet/list not built                                             |

Commerce **cannot** ship listings without vendor lifecycle (apply → vet → list eligibility).

### 2.3 Adjacent money surfaces (do not overload)

| Surface              | Relation                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `svc-pay`            | Explicitly excludes commerce plugins / subscriptions as **separate** tracker features (`services/svc-pay/src/index.ts`, README) |
| `svc-p2p`            | P2P merchants are a different mountain (`p2p.merchants`)                                                                        |
| `ops.admin` listings | Staff market enable — not vendor marketplace catalog                                                                            |
| Pay commerce plugins | Out of scope for this row’s Fiat marketplace design unless product unifies later                                                |

### 2.4 Doctrine taxonomy (product prioritisation needed)

Coverage matrix: **eight vendor categories** (bots, DeFi, compliance, payment ext., security/custody, data, advisory, partner integrations) — `INTAFACED_DEFINITIVE_BUILD.md` marketplace rows. Owner prioritises which ship first; agents do not invent taxonomy scope.

---

## 3 · Doctrine constraints

| Law           | Implication                                                                      |
| ------------- | -------------------------------------------------------------------------------- |
| §8.7          | Vendor lifecycle + listings/subs/purchases via ledger recipes + house commission |
| §0.6          | No balances in market service; recipes only                                      |
| Decimal money | Wire strings / scaled bigint                                                     |
| Stake truth   | Re-check vendor eligibility + slots on purchase if stake-gated                   |
| Scopes        | Real api_keys scopes when service exists                                         |
| Class M       | Purchase/subscription/commission = money self-audit + failure tests              |
| Events        | NATS versioned payloads in `packages/events` if cross-service                    |

---

## 4 · Order of operations (must not invert)

1. **`market.vendors`** — apply, vet, stake-gated slots, list eligibility (no commerce money).
2. **`market.commerce`** — listings + purchase recipe with commission split + tests.
3. **Subscriptions** — second PR (recurring recipe, cancel, failed renewal).

Research pack does not start code.

---

## 5 · DoD sketch (checkable — staged)

### Stage 0 — vendors green

- [ ] Vendor lifecycle Stage 1–3 from `TRK-market.vendors` complete enough to attach listings.

### Stage 1 — listing catalog (no money)

- [ ] Listing schema (vendor_id, offer type, price asset, status).
- [ ] CRUD under `market:write`; public read under `market:read`.
- [ ] Suspended vendor cannot create/update listings.

### Stage 2 — one-time purchase (Class M)

- [ ] Ledger recipe: buyer → vendor (net) + house commission; idempotent keys.
- [ ] Failure tests: vendor suspended, stake dropped, commission config missing, insufficient funds, double-purchase replay.
- [ ] No number money; no balance table in market.

### Stage 3 — subscriptions

- [ ] Period billing recipe; cancel path; past-due policy (product law).
- [ ] Tests for renewal failure without silent free access.

### Stage 4 — product polish

- [ ] Premium placement if stake-gated (doctrine vendor model).
- [ ] Admin/ops views — via contracts or admin BFF, not market holding funds.

**Tracker `done`:** Stage 2 minimum for title words listings/purchases/commission; subscriptions may stay residual if title split later.

---

## 6 · Gaps

1. Entire `svc-market`.
2. Vendors mountain unfinished.
3. No commission config ownership (config vs market service).
4. No ledger recipes for market.
5. No events catalog entries for market purchases.
6. Product: which of 8 categories first; subscription legal terms.

---

## 7 · Risks

| Risk                                     | Notes                                       |
| ---------------------------------------- | ------------------------------------------- |
| Build commerce before vendors            | Orphan listings / no stake gate             |
| Commission without recipe                | §0.6 violation                              |
| Soft-fail on missing commission config   | Must refuse                                 |
| Conflating with pay plugins              | Split tracker features by design            |
| On-chain-only listing under this Fiat id | Out of scope unless product redefines plane |
| Class M skip                             | Merge gate fail                             |

---

## 8 · Estimated size

| Slice                         | Size           | Notes                  |
| ----------------------------- | -------------- | ---------------------- |
| Research (this)               | **XS** Class N |                        |
| Vendors dep                   | **M–L**        | Separate mountain      |
| Listings schema + API         | **M**          | After vendors          |
| Purchase + commission recipes | **M** Class M  | Failure tests required |
| Subscriptions                 | **M**          | Second PR              |
| Full 8-category marketplace   | **XL**         | Program                |

**First commerce PR must include** failure tests (vendor suspended, stake dropped, commission config missing → refuse). No implement from research alone.

---

## 9 · Related docs / code

- `INTAFACED_DEFINITIVE_BUILD.md` §8.7 + vendor taxonomy rows
- `docs/ops/trk/TRK-market.vendors.md`
- `packages/config/src/modules.ts` — market module
- `packages/auth/src/scopes.ts` — market scopes stub
- `services/svc-token/src/economics/staking.ts` — `vendorSlots`
- `services/svc-pay` — excludes commerce plugins (pointer only)
- `packages/ledger-client` — recipe home for future market recipes

---

## 10 · Explicit non-goals

- No invent commission bps.
- No Shehzad M1–M7 implement under market.
- No balances or custody of vendor payouts outside ledger.
- No R07/R01 stamp content.
- No pay.plugin scope creep without tracker mountain event.
