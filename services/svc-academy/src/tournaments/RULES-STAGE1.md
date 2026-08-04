# Tournament ladder rules — Stage-1

1. **No money.** No prize pools, no ledger posts, no IFC balances in this service.
2. **Season lifecycle:** `scheduled` → `live` → `frozen` | `ended`. Scores write only in `live`.
3. **Rank:** higher score wins; equal score → earlier `updated_at` keeps higher rank (no silent re-rank after freeze without a new season).
4. **Score authority (Stage-1):** operator `admin:write` only. Paper/live trade sources are product law residual.
5. **Kill-switch:** `ACADEMY_TOURNAMENT_ENABLED=false` refuses all tournament procedures.
