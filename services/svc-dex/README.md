# svc-dex — the Protocol Plane's front door (§8.6, §17.5)

> §17.5: _"`svc-dex` is absorbed into this plane — the DEX is not a module beside the exchange; it IS the Protocol Plane's front door."_

Permissionless by construction, non-custodial by proof.

## Why there is no KYC here

§503, and it is worth quoting exactly because it is the difference between this and evasion:

> _"Sovereignty by architecture, not evasion. No-KYC exists on the Protocol Plane because there is nothing to KYC — the platform never holds user assets there. Reference proof: Hyperliquid's entire model."_

This is not a relaxed version of the custodial venue. It is a different custody posture, and the absence of an identity gate follows from it rather than being granted.

Three mechanisms make that structural rather than aspirational:

1. **`custody-scan` covers this service.** It fails the build if svc-dex imports `ledger.post` or any write recipe. Doctrine §16.10: _"Provably non-custodial or it doesn't merge."_
2. **No `INTERNAL_SERVICE_SECRET` in its environment.** That secret is what lets a service reach `ledger.post`. Without it, an import that slipped past the scanner still could not move value.
3. **No `DATABASE_URL`.** A database here would eventually hold a position, and a position we hold is custody.

## API contract

| Procedure | Access                                          | Purpose                              |
| --------- | ----------------------------------------------- | ------------------------------------ |
| `health`  | public                                          | liveness; reports `custodial: false` |
| `quote`   | `publicJurisdictionProcedure('dex','protocol')` | best execution across venues         |

`quote` still runs the jurisdiction matrix. **A sanctioned region is a legal constraint, not a custody one** — `checkAccess` short-circuits a `custodial: false` protocol-plane module to `allowed.permissionless` before any tier is read, so the gate that remains is the one that must, and the one that must not is gone.

Compare `svc-trade`, the custodial venue: `scopedProcedure('trade:write')` with `minTier: 'basic'`. Same platform, two planes, and the difference is one line in each router.

## The smart order router

§8.6: _"internal book vs. pool quote → best execution."_

Two venues quoting the same headline price are usually not equivalent. An AMM quote already includes its price impact but pays gas; a book quote is exact at the top and worse as depth is consumed. **Comparing headline prices picks the wrong venue routinely**, so this compares _effective price_ — what the taker actually ends up with after fees and settlement cost.

Fees apply to the side that pays them: a buyer receives less base, raising cost per unit; a seller receives less quote, lowering proceeds per unit. Settlement cost is added on a buy and subtracted on a sell — it is a cost to the taker in both directions and must never look like income.

Routing is greedy over per-venue quotes. **Not provably optimal** — a true optimum needs a depth curve per venue, not a single quote. Ties break on venue id so routing is a function of the quote _set_, not of arrival order: two identical requests must route identically, or a fill becomes unreproducible and no dispute about it can be settled.

## Events

**None.** This service publishes and consumes nothing.

## Ledger recipes used

**None, and that is enforced.** See `custody-scan`. If this section ever lists a recipe, the DEX has stopped being a DEX.

## Kill-switch

`dex.routing` in `FLAG_REGISTRY`.

## Not built yet

- **Quote sourcing.** `quote` takes venue quotes as input rather than fetching them. Wiring it to svc-indexer read models and the internal book is the next PR.
- **Order submission.** Routing decides _where_; executing against a pool is a contract call from the user's own smart account, which belongs with `svc-protocol` and needs the contract toolchain socket closed first.
- **Depth-curve routing.** See above — greedy is deliberate and documented, not accidental.
- **No AMM pool implementation.** §8.6 calls for pools from audited templates; nothing here creates or prices one.
