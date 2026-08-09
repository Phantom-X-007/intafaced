# LANE STOP — L07 MARKET · wave 4 · 2026-08-09

**Wall:** `services/svc-market/**`  
**Tip at write:** re-derive (`git fetch && git log -1 --oneline origin/main`).  
**SAFE TO CLOSE:** **no** — #1189 not merged (CI Tests red on **svc-pay** tip flake/break, not market).

---

## Verdict (one line)

**Market commerce C1+C2 is built and Class M–audited on #1189; monorepo seal is blocked by `svc-pay` test on tip, not by market.**

Proof from CI log (head ~`ee2464cf`):  
`✓ src/commerce/commerce.test.ts (23 tests)` · Typecheck & build **success** · market typecheck **clean**.  
Failed: `svc-pay` `payment-service.test.ts` — `0xg4finish` is not a valid EVM address (L04 wall; main CI also red/null).

---

## Shipped

| Item                        | Proof                                            |
| --------------------------- | ------------------------------------------------ |
| **#1276** TRK honesty       | **MERGED** — packs no longer claim no svc-market |
| **#1311** mid-wave stop     | **MERGED**                                       |
| Vendors Stages 1–3          | **On tip** (sealed — no rebuild)                 |
| Scopes + edge `/api/market` | **Sealed on tip**                                |
| Oversell / no `is_listed`   | **Sealed on tip**                                |
| Ranking                     | **PARK** DIRECTION §8                            |
| Subscriptions C3            | **PARK** — no product law                        |

## In flight

| Item                             | Status                                                               |
| -------------------------------- | -------------------------------------------------------------------- |
| **#1189** commerce C1+C2 Class M | OPEN · mergeable when Tests green · **market green, pay red on tip** |

### #1189 stack (Done bars met in PR)

1. Listings + one-time purchase via `recipes.marketPurchase`
2. Blank `MARKET_HOUSE_COMMISSION_BPS` → `market.commission_not_configured`
3. Create = approved + `claimSlot` (not already-listed)
4. Listing↔slot integrity + over-capacity after unstake (`market.listing_over_capacity`)
5. Class M failure tests (insuff / susp / orphan / re-drive snapshot)
6. Mount scopes + refuse-code mapping
7. README truth

## Parked + pick-up

| Unit                             | Why / next                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Merge #1189                      | Wait tip **svc-pay** Tests green (or L04 fixes `0xg4finish` fixture) → re-run CI → squash-merge · Class M audit already in PR body |
| Tracker `market.commerce` → done | After merge; note C3 residual                                                                                                      |
| C3 subscriptions                 | Nitro product law first                                                                                                            |
| Commission bps value             | Nitro only                                                                                                                         |
| Ranking                          | DIRECTION §8 Nitro only                                                                                                            |

## Nitro must decide

1. House commission **bps**
2. Subscription past-due / cancel / period law
3. Ranking vs keep registration order

```
LANE: L07 MARKET wave 4
shipped: #1276 TRK honesty · #1311 stop bank · vendors/scopes/oversell sealed on tip
in flight: #1189 listings+purchase Class M (market 23/23 green; CI Tests blocked by svc-pay tip)
parked: C3 subs · ranking §8 · commission bps value
Nitro must decide: commission bps · subscription law · ranking
SAFE TO CLOSE: no
tip: re-derive
```
