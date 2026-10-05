# Refusal rules the repo already has

Read at `f320618e8`. These are rules already written. This note does not add a rule, an amount, or a sanctions entry.

A later room decision must not contradict the rows below. `docs/adr/2026-10-02-redesign-may-replace-product-ui.md` may replace the product UI and the unsettled color lock. It says the money rows stay as they were.

## What stays blank

`AGENTS.md` Ship item 4:

> A blank price, limit, or sanctions list stays blank: refuse that action with a typed error. Do not invent live §8 magnitudes or sanctions list content.

`docs/adr/2026-10-02-redesign-may-replace-product-ui.md`:

> Amounts stay exact. The product never invents a live price or a balance.

`docs/INTERNET-LEVERAGE-LAW.md` §3 hard ban: "Invent mids/depth/prices so UI looks live."

`PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md` §0.2:

> **Refuse closed.** Unknown ownership, stale risk, missing limits, incomplete market state, ambiguous settlement, or unavailable compliance decisions stop the action.
>
> **No invented owner numbers.** Every live leverage, concentration, haircut, fee, rebate, position limit, settlement threshold, SLO, and recovery magnitude remains `OWNER-SET` until explicitly decided.

The same file, opening, says it is not "permission to invent regulatory policy, risk magnitudes, collateral haircuts, or live limits." §0.3 ends: "Owner magnitudes stay `OWNER-SET`."

`packages/ledger-client/src/http-errors.ts`: a missing or empty wire amount is not a balance. `wireAmount` returns null. The comment says never pad `'0'`. Empty is not failed is not zero. `InsufficientFundsError` is rebuilt only when both `requested` and `availableBalance` are actually on the wire.

`packages/config/src/screening.ts`: `SHIPPED_SCREENING_REGIONS` is an empty array. The comment says counsel content ships empty until an owner supplies a list, and filling the array is Class X. `UNSET_SCREENING_LIST` uses that empty array, `declaration: 'unset'`, `configured: false`, `source: 'unconfigured'`. `configured: false` means nothing was screened, not that a region is clear. `consultScreeningList` on `unset` returns `outcome: 'unconsulted'`, never `clear`.

No ADR filename contains `limit`. No ADR filename contains `sanction`. The blank-value ADRs whose names say so are the two below. The price ADR whose name says so is the oracle ADR in the next section. §8 rates are a separate named ADR, also below, because `AGENTS.md` forbids inventing live §8 magnitudes.

### Blank house commission

`docs/adr/2026-08-15-house-commission-refuse-blank.md`:

> Blank `MARKET_HOUSE_COMMISSION_BPS` (or a successor named authority) refuses. Silence is not a free house cut. `0` is lawful only when the owner publishes `0` on that authority (D26-P0-02). Agents must not invent free commission.

Typed error already in code: `market.commission_not_configured`.

`services/svc-market/src/commerce/commerce-service.ts` `requireCommissionConfigured` throws `MarketError` with that code when `commissionBps === null`, before slot burn and before a ledger post. `services/svc-market/src/env.ts` says `MARKET_HOUSE_COMMISSION_BPS` has no default, and setting `0` is an explicit owner decision, not silence. This note does not publish a rate.

### Blank listing policy

`docs/adr/2026-08-15-listing-policy-refuse-blank.md`:

> Blank listing policy = no list. Absence of an owner-published listing policy is **refuse**, never default-allow.

Named refuse code in that ADR: `trade.listing_policy_unset`.

That string is not in any `.ts` file on this commit. `docs/ops/owner-ruling-packet.json` says the seal is docs and ADR only, and `listMarket` wiring is residual. The name is law. The TypeScript throw is not on this tree. Other refuse codes the same ADR cites, and does not re-implement, are `trade.unsettled_asset_class_listing`, `trade.insurance_fund_empty`, `trade.options_settlement_law_unset`, `trade.options_fixing_unconfigured`, and `trade.options_terms_incomplete`.

### §8 rates

`docs/adr/2026-08-15-d26-p0-02-section8-rates-refuse-closed.md` (filename says rates and refuse-closed, not price, limit, sanctions, or blank):

> Until the owner publishes each named parameter into config authority, the gated surface stays refuse-closed and says so. A seeded rate in source (or in an ADR JSON block) is not authority. Agents must not invent, copy-forward, or "confirm" a number to unblock a door.

It names four gated surfaces and publishes no magnitude: copy `leader_share`, market commission, affiliate commission tiers, and the pay fee table. Copy payout's residual string is already in `services/svc-trade/src/copy/errors.ts`:

> `COPY_FEE_SHARE_RESIDUAL` = `DIRECTION §8 / D26-P0-02 leader_share_bps is owner-only — refuse-closed (never invent fee-share rates)`

## What refuses, and the typed name where code has one

### Price

`docs/adr/2026-08-08-price-oracle-fail-closed.md`: marks for lending LTV and liquidation come from `FailClosedOracle`. The returned mark is the minimum of two fresh agreeing prices. Stale or disagreeing feeds revert. There is no average, no last-good fallback, and no read of our AMM.

`services/svc-protocol/src/oracle/fail-closed.ts` throws `OracleRefuseError`:

| Condition                                 | Code                  |
| ----------------------------------------- | --------------------- |
| A report is missing, or `updatedAt` is 0  | `oracle.missing`      |
| `priceWad` is not positive                | `oracle.bad_price`    |
| Either report is past the staleness bound | `oracle.stale`        |
| Disagreement is past the max              | `oracle.disagreement` |

`AGENTS.md` does not give a second typed name for a blank UI price. The scan below rejects an invented figure instead of filling one.

### Sanctions list

Shipped list stays empty, as above. Typed names already in code:

| Where                                                        | Name                                                                         | When                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/config/src/screening.ts`                           | `denied.screening_unconfigured`                                              | Prod or staging money posture, list grade `unconfigured`. `ScreeningMoneyPostureError`.                                                                                                                                         |
| same file                                                    | `denied.screening_fixture`                                                   | Prod or staging, list grade `fixture`. A placeholder list is not counsel.                                                                                                                                                       |
| `packages/config/src/jurisdiction.ts`                        | `UnscreenedJurisdictionError`, code `denied.screening_unconfigured`          | Boot on an enforced env while `declaration === 'unset'`. Refuses to start. A business-matrix block does not satisfy the guard.                                                                                                  |
| `checkAccess` in that file                                   | `denied.screening_unconfigured` or `denied.screening_fixture`                | Only when screening fail-closed is on. Default env is off, and an allowed decision must still say whether a list was consulted.                                                                                                 |
| same function                                                | `denied.region_unknown`                                                      | Region unresolved and region fail-closed is on. The unresolved sentinel is not a restrictive jurisdiction.                                                                                                                      |
| `services/svc-agents/src/risk-compliance/screening-draft.ts` | `screening_unset`, `screening_empty`, `inputs_missing`, `decision_forbidden` | Draft status `refuse`, `kind: 'not_a_decision'`, `userMessageKey` `agents.error.capability_unavailable`. Empty or unset screening is unknown, not a cleared account. `asDecision` or `writeReviewedBy` is `decision_forbidden`. |

`SCREENING_REVIEWED_EMPTY` in `packages/config/src/screening.ts` is the whole-value token `none`. That token means the owner recorded a reviewed empty list. It is not a region and not list content. This note does not supply regions, reasons, or a source string.

### Limits

No ADR is named for a limit. `AGENTS.md` still says a blank limit stays blank and the action refuses with a typed error. `PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md` §0.2 says missing limits stop the action, and a live position limit stays `OWNER-SET`. This note does not name a limit figure, and it does not treat pagination `*_list_limit_unset` codes as that rule.

## What must not be stored as a JavaScript number

`AGENTS.md` Money item 2:

> Never store money in a `number`. Decimal strings on the wire, scaled bigint in memory.

`packages/ledger-client/src/money.ts`: Postgres stores `numeric(38,18)`. In TypeScript that is a scaled bigint, never a `number`. The wire type is `AmountString` (a decimal string). The memory type is `Amount` (bigint scaled by `10^18`, `DECIMALS = 18`). `packages/ledger-client/src/types.ts` types `EntryInput.amount`, `PostedEntry.amount`, and `PostedEntry.balanceAfter` as `Amount`.

`parseAmount` throws `MoneyError` when the value is not a string (a bigint is accepted and checked), when the string is malformed, when it has more than 18 decimal places, or when it does not fit `numeric(38,18)`. Message for a non-string: `Amount must be a decimal string`.

`mul` and `div` require an explicit rounding mode. There is no silent language rounding. `mulBps` defaults to `ceil` so a fee that rounds away does not become a fee the house pays. A credit to a user must pass `'floor'` so rounding does not invent value. The `bps` argument is a non-negative integer rate, not a money amount. This note does not publish a bps figure.

`PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md` §0.2: "Decimal strings cross boundaries; scaled bigint is used in memory. Money never enters a JavaScript `number`." §0.3: "Decimal strings on the wire." Greeks never put "float NPV on the wire." Money never uses `decimal.js` on the wire.

`docs/adr/2026-08-07-pay-public-api-law.md` §2.3:

> amounts are decimal strings with an explicit asset, never minor units and never a number.

§3 repeats: never minor-unit integer amounts. The public API must not use a minor-unit integer plus a currency code.

## How a ledger post is refused

`packages/ledger-client/src/client.ts` and `memory-ledger.ts`. `MemoryLedger` is the executable specification the Postgres ledger must match. Value moves only through `post`. `AGENTS.md` Money item 1: move value only through `packages/ledger-client`. No module holds its own balance.

Order in `MemoryLedger.post`:

1. `assertIdempotencyKey`. Missing, or shorter than 8 characters, throws `InvalidEntryError` (`ledger.invalid_entry`): "An idempotency key of at least 8 characters is required on every post."
2. If that key already committed, return the original transaction. Do not post a second time. A missing row for a known key throws `LedgerError` `ledger.corrupt_index`.
3. `assertValidPost`, which checks the key again, then owner id space, balance, paired locks, purposed locks, and unpurposed available.
4. Stage the balance. If the next `available` balance would be negative and the owner type is not `treasury`, throw `InsufficientFundsError` (`ledger.insufficient_funds`). `treasury` may go negative because it is the boundary with the outside world. User, subaccount, module, and house may not.

`assertBalanced` (`ledger.unbalanced` via `UnbalancedTransactionError` when a per-asset sum is not zero):

- Fewer than two entries: `InvalidEntryError`. Value does not come from nowhere.
- A negative entry amount: `InvalidEntryError`. Amounts are unsigned. Direction carries the sign.
- A zero entry amount: `InvalidEntryError`. A movement of nothing is not a movement.

`assertOwnerIdentifierSpace`: an `ownerId` outside the space its `ownerType` declares throws `OwnerIdentitySpaceError` (`ledger.owner_identity_space`). User and subaccount ids are lowercase canonical UUIDs. Module, house, and treasury ids are platform slugs. A wrong id must not open a second account for the same human.

`assertPairedLocks`: a lock that increases by more than the same owner's available gives up throws `InvalidEntryError` ("Unfunded lock"). Locked value is not invented.

`assertPurposedLocks`: a lock pot with an empty purpose, or a purpose starting with `legacy:`, throws `InvalidEntryError`. `assertAvailableUnpurposed`: a purpose on `available` throws `InvalidEntryError`. Available is one pot.

`packages/ledger-client/src/http-errors.ts` maps a structured ledger HTTP body back to `LedgerError` and keeps the service's `code`. It does not invent a code when the body has none. In that case it throws a bare `Error`. The comment lists the codes `s2s-http` puts on the wire: `ledger.insufficient_funds` (400), `ledger.owner_identity_space` (400), `ledger.unauthenticated` (401), `ledger.frozen` (412), and any other `LedgerError` (500).

## What the parked-chain rule forbids starting

`AGENTS.md` INTACHAIN:

> Trading stays on the house book. Base work that already exists continues. INTACHAIN stays parked until Nitro writes GO. Leave `svc-chain` and P1 unstarted.

`docs/adr/2026-09-03-protocol-rails-until-intachain.md`, until Nitro says GO again on P1:

1. Fiat exchange stays the house book. Do not move matching onto Base, HyperEVM, HIP-3, or a new L1, L2, or L3.
2. Protocol Plane P0 stays contracts on Base (CI: anvil). Labels stay not INTACHAIN, and `audited: false` until a paid firm.
3. INTACHAIN P1 implement is parked. No `svc-chain`, no genesis, no Cosmos/CometBFT binary, no `chain.mainnet` Done.
4. Banned until a new Nitro GO: HIP-3, HyperEVM as the protocol home, a Base appchain or extra L3, a second L2, and calling any Base deploy "our chain."

Named leftovers this parks, and does not delete: `chain.mainnet`, `chain.evm`, `bridge.canonical`, `chain.validators`, `chain.governance`, `predict.markets` as an INTACORE type, `chain.rust-core`.

`docs/adr/2026-10-02-redesign-may-replace-product-ui.md`: "The parked chain stays parked until Nitro writes GO." Also kept there: money only through `packages/ledger-client`, no second money book, no second matching engine, npm `ccxt` stays uninstalled, and FIX, SBE, and Greeks stay adapters.

`AGENTS.md` Money item 3 says the same, and points at `PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md` §0.3. That section's never column includes, among others: OpenDAX, Hummingbot-as-venue, an npm CLOB, Java `exchange-core` as source of truth, Formance, TigerBeetle, Java wallet tables, Hyperswitch, CCXT, and `decimal.js` on the wire. Adapter is not a book. `docs/INTERNET-LEVERAGE-LAW.md` §3 also bans a second balance book and Hyperswitch in the money path.

## What a pay error code is allowed to do

`docs/adr/2026-08-07-pay-public-api-law.md` §2.6:

> the existing internal codes are the public codes, in a stable envelope. A refusal names what to do next, in the house style — `pay.rail_operation_unsupported` already says "NOTHING WAS ATTEMPTED" because the first question an operator has is whether anything needs unwinding.

Rejected there: mapping those codes onto a competitor's error taxonomy.

`services/svc-pay/src/rails/rail-adapter.ts` `RailOperationUnsupportedError` uses code `pay.rail_operation_unsupported`. The message says nothing was attempted and nothing needs unwinding. A missing capability is thrown. It is not a `RailResult` with `ok: false`. A decline is a real answer from a counterparty. An unsupported operation must not look like one, because that would report a movement that never happened.

The same ADR also refuses these shapes, without renaming them as pay error codes:

- §2.2: every mutating POST requires `Idempotency-Key`. Omitted key is a `400`. The same key with a different body is a `409`.
- §2.5 and §3: a sandbox rail must not move value in an enforced environment. `assertRailMayMoveValue` already refuses. The REST layer gets no exception.
- §3: the API does not hold a balance. Balances stay in `ledger-client`. It does not imply a live acquirer. It does not add a second auth mechanism inside `svc-pay`. It does not reimplement the tRPC doors listed in §1.
- §5: pricing, limits, and rate tiers are not decided in this ADR.

## What `tooling/ci/fabricated-money-scan.mjs` rejects

It scans the Vue shell under `vendor/` (a directory that has `App.vue` beside `main.js`). It does not scan third-party bundles, `*.golden.js`, or `*.test.js`. `BASELINE` is `{}`. A new hit fails the process. A stale baseline row fails until that row is deleted. A missing shell prints that nothing was scanned and exits 0. It does not invent a pass over a surface it did not find.

It rejects three classes:

1. In a `<template>`, a money-shaped literal. The shapes are a currency symbol against a digit, a thousands-separated group, and two or more decimal places. HTML comments and `style` or `class` values are blanked first. Bare small integers are not matched. The fix is to render a service response, or to render the absence. Do not add a baseline row for new debt.
2. An increment, precision, floor, or rate identifier given a literal default. That includes a decimal string, a digit count, a hardcoded decimal constant, and a ternary digit. A `null` default is not a hit. If the instrument did not say, the surface refuses.
3. Money multiplied by money in a template. That figure was not sent by a service, and it is computed as a JavaScript number. A notional is the venue's to state. Division is not matched. One fetched value converted by a constant is not a hit.

The failure text says: never substitute, and never add a row to `BASELINE` to make the line go away.
