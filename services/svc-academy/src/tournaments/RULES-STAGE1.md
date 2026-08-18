# Tournament ladder rules — Stage-1 / Stage-3

1. **No money.** No prize pools, no ledger posts, no IFC balances in this service.
2. **Season lifecycle:** `scheduled` → `live` → `frozen` | `ended`. Scores write only in `live`.
   - `frozen → live` is **refused** (no re-open / re-rank on the same season).
   - `frozen → ended` is the only exit from freeze; a new ladder needs a **new season**.
3. **Rank:** higher score wins; equal score → earlier `updated_at` keeps higher rank (no silent re-rank after freeze without a new season).
4. **Score authority (Stage-1):** operator `admin:write` only. Paper/live trade sources are product law residual.
5. **Kill-switch:** `ACADEMY_TOURNAMENT_ENABLED=false` refuses all tournament procedures.
6. **Stage-3 IFC prizes refuse-closed:** `prize-refuse.ts` — fund / payout / escrow / clawback / invent_balance always refuse. Freeze and season transitions call `assertNoPrizeAttachment`. Calendar close does **not** invent pools. Class M ledger recipes are a separate PR when product law is ready.
