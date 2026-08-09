# LANE STOP — L13 TOKEN · wave 4 · 2026-08-09

## Packet

```
LANE: L13 TOKEN wave 4
shipped: #1257 tRPC stake amounts no longer 10^18-scaled · #1268 yield plan matches sweep + zero buy cannot claim a window · #1275 README honesty · #1291 cron mint kill-switch has HTTP proof
in flight: #1273 refusal tests (pending CI after fix push) — merge when green
parked: empty-staker yield window has no header claim (adversarial residual on #1268) · mint post-then-row crash×retune · emission curve §8 owner numbers · token.yield/buyback/governance sockets (no flywheel invention)
Nitro must decide: emission curve live vs seed (§8) — none for this lane's craft
SAFE TO CLOSE: yes after #1273 green+merge (or leave PR open; money seals already on tip)
tip: see origin/main at close
```

## What shipped (plain)

| PR | Class | What |
|---|---|---|
| #1257 | M | Edge tRPC `stakeOf`/`accessOf` used raw scaled bigint; now `formatAmount` (same class as #1100 S2S seal) |
| #1268 | M | Dup module sources planned more than swept; concurrent re-settle lied on counts; `tokensBought=0` claimed GiST window |
| #1275 | N | README said `revenueTotal` unvalidated + missing yield claim — code already sealed both |
| #1291 | N | Extracted cron mint route; unit-proved kill-switch 503 + zero mint |
| #1273 | P | Pending unstake + governance edge refusals + emission_curve params_invalid (in flight) |

## Sealed re-verified on tip (not re-shipped)

- #1100 internal stake fail-open rescale
- #1083 mint ceiling vs book
- #1076 yield plan freeze
- #767 buyback claim-before-burn

## Fenced (not touched)

- market stake writes · protocol minter · emission curve owner numbers

## Pick-up for next cook

1. Empty-staker distribute: claim `(window_id, total)` before sweep (YLD-R03)
2. Mint claim-before-post so crash+retune cannot under-book supply
3. Merge #1273 if still open
