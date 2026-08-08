# svc-market

Vendor lifecycle for `market.vendors` (§8.7). **Stage 1: a user applies to be a
marketplace vendor, and an operator vets the application.** That is the whole
scope of this service today.

Doctrine: §0.6 no balances here; §2 no SQL into another service's schema; the
stake numbers stay in svc-token.

## Stages

| Stage | What it is                                                   | Built |
| ----- | ------------------------------------------------------------ | ----- |
| **1** | Apply → vet, with an append-only decision history            | **✓** |
| 2     | Stake-gated listing slots, from `token.stakeOf` under a lock | no    |
| 3     | Public listing eligibility, feeding `market.commerce`        | no    |

## API

tRPC under `/trpc` (edge mounts `/api/market`). Principal via edge HMAC
(`EDGE_PRINCIPAL_SECRET`).

| Procedure          | Scope          | Behaviour                                       |
| ------------------ | -------------- | ----------------------------------------------- |
| `applyAsVendor`    | `market:write` | Create the caller's own application (`applied`) |
| `mine`             | `market:read`  | The caller's own application, or `null`         |
| `listApplications` | `market:ops`   | Operator queue — undecided first, oldest first  |
| `vet`              | `market:ops`   | Record an operator's decision and apply it      |
| `history`          | `market:ops`   | The decision trail for one application          |

HTTP: `GET /health`, `GET /ready` (`stage: 1-apply-vet`).

`applyAsVendor` and `mine` carry `{ module: 'market' }`, so the JURISDICTION_MATRIX is
enforced: `market` is OPEN_BASIC, so an applicant needs verification tier
`basic`. The operator procedures deliberately do not — a desk operator's
authority is `market:ops`, not their own KYC tier.

### What this service will not decide

**There is no vetting criterion here, and there must not be one.** No rule exists
anywhere in this repository for what makes an application good;
`docs/ops/trk/market.vendors.md` names it an open product question that belongs
to the owner. So `vet` takes an operator's decision and their reason, records
both, and applies the state — a log with a side effect, not a decision engine. A
caller that reaches `VendorService.vet` without holding `market:ops` is refused
with **`market.vet_operator_required`**, including a future policy engine or an
internal script. Precedent: `pay.kyb_operator_required`.

**There are no stake numbers here.** Stake-gated slot capacity is Stage 2, and
the tier table behind it (`vendorSlots`) belongs to
`services/svc-token/src/economics/staking.ts`. This service restates none of it —
a second copy of a stake schedule is a second answer to "may this vendor list".

**There is no suspension policy.** `suspended` is a state an operator may set
with a reason. Nothing here decides when that should happen, on a timer or
otherwise. Any transition between decided states is permitted, because a
transition map is itself a policy nobody has ruled on.

## Events

**None published, none consumed, Stage 1.** No accepted bus subject exists for
vendor lifecycle, and `packages/events` is not a dependency of this service.
Declaring a subject with no publisher or subscriber is an orphan the wiring gate
correctly refuses; connecting to NATS to publish nothing would add a boot
dependency that can fail in exchange for no capability. When a subject is
accepted, it lands in an events PR first.

## Ledger

**No ledger recipes, and no `@intafaced/ledger-client` dependency.** This service
holds no balances and moves no value. `market` is `custodial: true` in the module
registry because the _marketplace_ eventually takes custody of purchase funds —
that is `market.commerce`, a different mountain with its own recipes. Nothing in
`market.vendors` is an amount, a price or a balance, and no column in its schema
could hold one.

## Schema

`market.vendors` — one row per **user** (`user_id` UNIQUE), the reversible answer
to the org-vs-user question the spec leaves open.

`market.vendor_status_events` — append-only, enforced by a database trigger, with
both sides of every transition, a required non-blank reason, the operator's id
and the scope they held. A correction is a new row, never an edit: a history that
can be rewritten looks like evidence and is not.

## Observability

OpenTelemetry spans via `withMarketSpan` (`intafaced.money_path=false`, module
`market`). SLO residual: one Grafana panel for application and decision rates —
ops backlog, not a Stage-1 ship gate.

## Kill-switch

Flags `market.listings` and `market.vendorApplications` are `NOT_ENFORCED` — the
live control is the edge kill-switch, which works because `/api/market` is in
`UPSTREAMS` (`services/svc-edge/src/routes.ts`). Nothing here reads the flags,
and the flag registry's own comment says so out loud rather than implying
otherwise.
