# Spec — Pro Exchange Rulebook, Market Lifecycle, and Integrity (`PX-S01`)

**Status:** Authoritative product contract; owner/external sockets remain refuse-closed  
**Scope authority:** [`PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md`](../PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md) v1.2  
**Requirements:** `PTX-M00-R01–R06`, `PTX-M02-R01–R06`, `PTX-M16-R01–R09`  
**Primary systems of record:** versioned rule package, canonical instrument master, append-only order-event audit, compliance case record, and `ledger-client` for every correction with value impact

This contract defines the constitution beneath every market. It does not authorize a jurisdiction, licensed entity, live asset, risk magnitude, sanction list, or principal role. Missing owner or legal inputs remain typed sockets and keep the affected market or action unavailable.

---

## 1. Promise and non-goals

A professional participant must be able to determine before trading:

- who operates the product and who the counterparty is;
- the instrument economics and every state in which orders may be accepted;
- how price/time priority, fees, settlement, interruptions, corrections, disputes, and delisting work;
- which rule version governed an order or intervention;
- how suspected abuse is investigated without hidden discretionary matching changes.

This spec does not define matching algorithms, portfolio-margin formulas, surveillance vendor selection, UI layout, legal advice, or numeric thresholds. Those belong to later child specs, owner decisions, or replaceable adapters.

## 2. Existing authority to reuse

- Constitutional exact-money, one-ledger, identity, adapter, and refusal laws in `INTAFACED_DEFINITIVE_BUILD.md`.
- Instrument enums, market/listing gates, matching journals, compliance gates, ledger recipes, and audit primitives cited as `E02`, `E03`, `E16`, and `E23` in the canonical scope.
- Accepted ADRs may constrain a market to an empty live set. A refusal is a valid state; an invented default is not.

Existing tracker checkmarks prove only their named slice. They do not waive any state, disclosure, surveillance, or reconstruction requirement here.

## 3. Actors, boundaries, and authority

| Actor                       | May do                                                                                    | May never do implicitly                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Product/rule owner          | Propose versioned rules and product parameters                                            | Activate a legally or operationally ineligible market                   |
| Listing committee/authority | Approve admission, status transitions, migration, and delisting within recorded authority | Rewrite historical instrument economics                                 |
| Market operations           | Execute approved halt/cancel-only/reduce-only/reopen actions                              | Change matching priority, settlement asset, or customer money           |
| Surveillance analyst        | Review alerts, preserve evidence, and propose cases                                       | Alter orders, fills, or ledger history                                  |
| Compliance officer          | Apply identity/product restrictions and regulatory dispositions                           | Use compliance as an undocumented matching preference                   |
| Incident commander          | Invoke pre-authorized severe-market controls and communications                           | Manufacture a price, limit, or settlement rule                          |
| Participant                 | Submit permitted intent and challenge decisions through the published process             | Escape rules through sub-account, session, broker, or venue indirection |

Material rule publication, market admission, emergency settlement, trade bust/correction, disciplinary disposition, and retrospective data correction require separately attributable proposer and approver when policy marks them dual-control. The policy may set stricter approval; it may not remove attribution.

## 4. Canonical objects

### 4.1 Rule package

A rule package is immutable after publication and contains:

- `ruleVersion`, operator/legal entity, effective and publication times;
- eligible products/users/jurisdictions and participant obligations;
- counterparty model per workflow: principal, matched-principal, agency, or external venue;
- matching, cancellation, settlement, liquidation, fee, data, correction, dispute, discipline, and wind-down rules;
- linked owner decisions, approved magnitudes, disclosures, and superseded version;
- proposal, approval, legal/compliance review, and publication evidence.

Every accepted order, quote, strategy deployment, fill, correction, and operator intervention records the governing `ruleVersion`. A new rule never silently mutates an already accepted instruction unless the prior package explicitly defined that transition and the action is recorded.

### 4.2 Instrument version

An instrument version is immutable and includes canonical ID, venue symbol, product kind, base/quote/settlement assets, precision, tick/lot, minimums, multiplier, exercise/expiry/fixing fields where relevant, price/quantity bands, fees/limits references, index/mark constitution references, lifecycle status, jurisdiction/product eligibility, and effective interval.

Economic fields cannot be edited in place after first accepted order. A change creates a new version and a migration or wind-down plan. Display aliases may change only if historical identifiers remain resolvable.

### 4.3 Decision and event identity

All objects use stable IDs that survive UI, REST, WebSocket, FIX, risk, matching, ledger, reporting, surveillance, and support: participant/legal owner, account/sub-account, session/key/device, broker/client tag, rule, instrument/version, order/client order, parent/child, trade, fee, ledger transaction, operator action, alert/case, correction, and incident.

Timestamps preserve source clock, observation time, receive time, decision time, engine sequence, and correction time where applicable. A normalized timestamp never erases the source timestamp.

## 5. Market admission and lifecycle

### 5.1 Admission dossier

Before `PRELAUNCH`, the dossier must record:

- legal/entity/jurisdiction eligibility and counterparty role;
- technical asset/contract definition and deterministic settlement;
- custody/deposit/withdrawal support, chain/reorg/fork behavior, or external settlement adapter;
- manipulation, concentration, issuer, oracle/index, stablecoin, liquidity, market-maker, and operational risks;
- surveillance coverage, data retention, disclosures, fees, limits, incident/wind-down owner, and test evidence;
- every unresolved owner/external dependency and its safe refusal behavior.

A missing mandatory item prevents activation. “We will decide after launch” is not an admissible value.

### 5.2 State machine

```text
DRAFT → REVIEW → APPROVED → PRELAUNCH → AUCTION/OPEN
                         ↘ REFUSED/ARCHIVED

AUCTION/OPEN ↔ POST_ONLY ↔ CANCEL_ONLY ↔ REDUCE_ONLY ↔ HALTED
AUCTION/OPEN → EXPIRING → EXPIRED → SETTLING → SETTLED → ARCHIVED
AUCTION/OPEN → DELISTING → CANCEL_ONLY/REDUCE_ONLY → SETTLED → ARCHIVED
```

Each transition has allowed order actions, treatment of resting/conditional/algo/RFQ orders, risk behavior, data status, customer notice, authority, reason code, evidence, and reversal eligibility. Unsupported transitions refuse. Service restart or missing dependency cannot reset a market to `OPEN`.

`HALTED` is not a generic healthy state. The reason distinguishes regulatory, technical, oracle/index, custody/chain, liquidity/disorderly-market, security, settlement, and operator causes. Reopen requires the corresponding recovery evidence and, where the rule package requires it, an auction.

### 5.3 Corporate actions and disruptions

Forks, migrations, airdrops, redenominations, chain halts/reorgs, issuer actions, index failures, fixing disruption, and recoverable wrong-asset deposits each have an instrument-specific decision tree. The platform records record time, eligible balances/positions, rounding, entitlements, custody status, tax/reporting treatment, correction path, and user notice. There is no automatic entitlement merely because an upstream chain produced one.

### 5.4 Delisting and wind-down

The plan defines notice, last order/cancel time, risk-reducing access, forced cancellation authority, close/transfer choices, fixing/settlement, borrow repayment, custody/withdrawal window, unresolved dust, record retention, support/dispute path, and treatment after a dependency failure. A market cannot be archived while a live order, position, unsettled trade, liability, receivable, or unresolved correction remains unaccounted for.

## 6. Emergency and correction controls

Every control is a scoped command with actor, authority reference, affected entities/accounts/products/instruments/order sets, requested and resolved state, reason, effective/expiry time, approval evidence, result counts, errors, customer communication, and reconciliation result.

Controls include halt, post-only, cancel-only, reduce-only, price bands, reject-new-risk, cancel-by-session/account/market, delist, emergency fixing/settlement, trade bust/correct, and restriction/suspension. Commands are idempotent. Partial success is durable and visible; retries operate only on unresolved targets.

No control directly edits balances. Any fee refund, bust, correction, settlement adjustment, or compensation uses a balanced, referenced `ledger-client` recipe that preserves the original posting and adds a correction. Unknown account ownership, asset, amount, rule, or approval refuses before posting.

## 7. Market integrity and surveillance contract

### 7.1 Detection coverage

The surveillance rule catalogue must cover at minimum self/wash trading, spoofing/layering, quote stuffing, marking, momentum ignition, collusion, insider/listing abuse, cross-account/product/venue manipulation, RFQ/block abuse, transfer/on-chain linkage, liquidation/oracle attacks, and misuse by internal/affiliate makers.

Each rule has version, hypothesis, inputs, identity aggregation, threshold source, exclusions, severity, known limitations, model validation, false-positive review, owner, and effective interval. Missing owner-set thresholds disable only the affected detector with an explicit control gap; they never become zero or an arbitrary default.

### 7.2 Alert and case state

```text
ALERTED → TRIAGED → INVESTIGATING → ACTION_PENDING → DISPOSED → CLOSED
                    ↘ REFERRED/REPORTED
```

Cases preserve immutable evidence manifests, queries/versions, analyst actions, linked accounts/orders/trades/transfers, legal holds, communications, approvals, disposition, reporting reference, and appeal. Access is least-privileged and all evidence reads/exports are audited. Case closure cannot delete source records or alter canonical trading history.

### 7.3 Fair access and conflicts

Fee tiers, market data, throttles, latency treatment, listing access, maker programs, and enforcement apply by published objective criteria. Internal/affiliate activity uses separately identified accounts and information barriers, receives no private customer intent, and remains surveillance-visible. Exceptions are time-bound, approved, disclosed where required, and queryable.

## 8. Disputes, discipline, and participant evidence

The public process distinguishes service complaint, order/fill dispute, error trade, market-data correction, liquidation appeal, fee/ledger dispute, restriction, and disciplinary action. Each has filing window, required evidence, acknowledgement, independent review where appropriate, decision authority, response target category, appeal, correction route, and record retention.

Customer-visible evidence includes governing rule/instrument version, canonical IDs, timestamps with semantics, order/fill state trail, price/fee basis, relevant market status, correction links, and plain refusal reasons. It excludes other participants’ private data and surveillance methods whose disclosure would enable evasion.

## 9. Interfaces and events

This spec requires typed contracts, not endpoint names. At minimum downstream specs must expose:

- current and historical rule packages and instrument versions;
- market status plus reason, effective time, allowed actions, and last-good state;
- proposed/approved/applied operator actions and per-target outcomes;
- admission/delisting/corporate-action calendars and notices;
- audit event lookup by common IDs subject to entitlement;
- correction/bust lineage and data correction notices;
- complaint/dispute submission and status without exposing protected case data.

Events are append-only, versioned, idempotent, replayable, and ordered per declared domain. Consumers reject unknown breaking schemas, preserve unknown additive fields, detect gaps, resnapshot where defined, and show staleness rather than pretending health.

## 10. Failure, recovery, and abuse cases

The implementation proof must exercise at least:

- rule/instrument version changes racing order submission;
- stale or missing market state during gateway recovery;
- partial halt/cancel-all and retry after process/region failure;
- oracle split, chain halt/reorg, maker withdrawal, depeg, and settlement outage;
- duplicate operator command, conflicting approvers, expired authority, and compromised key;
- audit/event gaps, clock skew, delayed correction, and evidence-store unavailability;
- cross-account/sub-account evasion, affiliate/self-trade, abusive RFQ, and insider access;
- delisting with live orders, positions, borrow, unsettled trades, and blocked withdrawals.

When authoritative rule, market state, identity, risk, compliance, or ledger dependencies are unavailable, new or risk-increasing intent refuses. Risk reduction may remain available only through a pre-specified path that cannot increase exposure or invent state.

## 11. Observability and operational evidence

Metrics and retained evidence cover status transition latency/failure, rejected stale-version intent, control result counts, audit completeness/gaps, clock health, surveillance coverage/disabled rules, alert/case aging, correction/bust volume, disputes and appeals, unresolved settlement/liability items, and notice delivery. Numeric targets are owner-set in the resilience spec; blank targets do not disable raw measurement.

Every release affecting this contract produces a schema/rule diff, migration and rollback plan, replay compatibility result, access-control review, and sampled causal reconstruction from participant intent to order/trade/ledger/report.

## 12. Definition of Done

This specification is implementation-ready when:

1. Every linked PTX requirement maps to a typed object, invariant, state transition, test, or named owner/external socket.
2. Rule and instrument versions are immutable, resolvable historically, and bound to every accepted intent and intervention.
3. Admission cannot activate with a missing mandatory dossier item; restart cannot promote market state.
4. All lifecycle and emergency transitions have deterministic order/risk/data/settlement behavior and idempotent partial-failure recovery.
5. Audit IDs/timestamps reconstruct order, trade, fee, ledger, operator, and correction causally.
6. Surveillance alerts/cases preserve evidence and support governed disposition without mutating source history.
7. Trade bust/correction and compensation preserve original postings and use balanced `ledger-client` recipes.
8. Disputes, discipline, appeals, notices, retention, privacy, and regulator/customer exports are contract-tested.
9. Load, cancel-storm, dependency-loss, replay, and severe-market tests produce retained evidence.
10. Every unset legal, owner, or external decision refuses through a named typed socket.

## 13. Open owner and external sockets

- Licensed entities and jurisdiction-by-product matrix.
- Counterparty role by order book, RFQ/OTC, liquidation, routing, and internal/affiliate maker workflow.
- Listing committee and emergency/disciplinary authority; appeal and notification policy.
- Index/oracle constitution and every live market/risk magnitude.
- Surveillance ownership, reporting obligations, record-retention duration, and position-accountability policy.
- Data transparency/licensing obligations and permitted disclosure of participant/order detail.
- Options/FX live instruments, settlement assets, custodians/rails, and disruption authority.

The safe default for each socket is unavailable/refused with a typed reason and customer/operator-visible remediation category. No child spec may fill these values by example.
