# Threat model one-pager — residual money (V2)

**Claim tags:** `[JUDGMENT 2026-07-29]` for residual focus after wave-1

| Attacker | Goal | Relevant layer | Mitigated by V2? |
| --- | --- | --- | --- |
| Stolen user session | Drain available via withdraw | L2/L3 | Hold + rail still required; reverse crash no longer strands status |
| Concurrent withdraw retry | Double-send | L3 | clientRef + attempt keys; reverse finalization advances attempts |
| Crash mid-stake | Unfunded yield claim | L3-2 | `pending` not yield-eligible; delete on ledger refuse |
| Crash mid-earn deposit | Interest on unfunded position | L3-3 | same pending pattern |
| Compromised service token | Mint XP / internal | L2 | wave-1 fixed awardXp + HMAC internals |
| Vendor co-run as books | Replace ledger | L9 | quarantine stands |
| Insider agent false-green PR | Ship weakened tests | L8 | wave cheat-diff still recommended on every PR |

**Not in V2 scope:** live chain rails, production host perimeter, full concurrent load suite.
