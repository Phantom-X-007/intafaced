# venue.aggregation — maintained venue mark

Lane: feat/trade-venue-maintained-mark
Tracker: venue.aggregation (stays ready — trading half / live-network CI / M3)
Goal: stop polling snapshotBook on every futures mark tick when ops opts in
Done-bar: TRADE_VENUE_MARK_STREAM ON uses existing MaintainedBook; desynced/missing observedAt → null; default OFF; no invented mid; no dual-edit of Nitro venue PRs
