# svc-market

Vendor lifecycle for `market.vendors` (§8.7). **Stage 2: a user applies to be a
marketplace vendor, an operator vets the application, and an approved vendor
holds listing slots their IFC stake tier pays for.** The public vendor profile is
Stage 3 and is not built.

Doctrine: §0.6 no balances here; §2 no SQL into another service's schema; the
stake numbers stay in svc-token.

## Stages

| Stage | What it is                                                 | Built |
| ----- | ---------------------------------------------------------- | ----- |
| **1** | Apply → vet, with an append-only decision history          | **✓** |
| **2** | Stake-gated listing slots, from `vendorSlots` under a lock | **✓** |
| 3     | Public listing eligibility, feeding `market.commerce`      | no    |

## API

tRPC under `/trpc` (edge mounts `/api/market`). Principal via edge HMAC
(`EDGE_PRINCIPAL_SECRET`).

| Procedure          | Scope          | Behaviour                                         |
| ------------------ | -------------- | ------------------------------------------------- |
| `applyAsVendor`    | `market:write` | Create the caller's own application (`applied`)   |
| `mine`             | `market:read`  | The caller's own application, or `null`           |
| `claimSlot`        | `market:write` | Take a listing slot, if the caller's tier has one |
| `releaseSlot`      | `market:write` | Give a slot back                                  |
| `slots`            | `market:read`  | Tier, capacity, held and **usable** slots         |
| `listApplications` | `market:ops`   | Operator queue — undecided first, oldest first    |
| `vet`              | `market:ops`   | Record an operator's decision and apply it        |
| `history`          | `market:ops`   | The decision trail for one application            |

HTTP: `GET /health`, `GET /ready` (`stage: 2-stake-gated-slots`).

Neither `claimSlot` nor `releaseSlot` takes a `vendorId`: a slot is always spent
against the caller's own vendor row. A claim that could name its vendor would let
anyone burn somebody else's capacity, and the refusal would land on the victim.

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

**There are still no stake numbers here.** Slot capacity is READ from svc-token,
never stored. The tier table (`vendorSlots`) belongs to
`services/svc-token/src/economics/staking.ts`, and no threshold, slot count or
tier name appears in this service or its schema — a second copy of a stake
schedule is a second answer to "may this vendor list", and the two diverge on the
first tuning change.

**There is no suspension policy.** `suspended` is a state an operator may set
with a reason. Nothing here decides when that should happen, on a timer or
otherwise. Any transition between decided states is permitted, because a
transition map is itself a policy nobody has ruled on. Stage 2 RELEASES a
vendor's slots when they leave `approved` — reacting to a transition an operator
recorded is not the same as deciding it.

## Stake-gated listing slots (Stage 2)

Capacity is `AccessTier.vendorSlots`, read from svc-token's
`GET /internal/stake/:userId` at claim time and again on every read. Not the tRPC
`token.stakeOf` — that is `scopedProcedure('token:read')` and self-only, and
svc-market does not hold the user's principal.

**Fails closed.** Network throw, non-2xx, an unusable payload, a `vendorSlots`
that is not a non-negative integer — all four refuse with
`market.stake_unavailable` rather than guessing a capacity. `slots` refuses too: a
read that cannot verify entitlement must not report a vendor as listable.

**No amount crosses the boundary.** The endpoint returns `staked` and
`tier.minStake` as decimal strings; this service reads NEITHER, because it needs
a capacity and not a balance. That is also the safest position on the bug PR #1100
fixed — a field that is never read cannot be accidentally re-scaled.

**Depends on PR #1100.** Until that merges, `/internal/stake/:userId` returns
HTTP 500 to every caller (`AccessTier.minStake` is a bigint and Fastify's
`JSON.stringify` fallback throws on one), so no slot can be claimed in an
environment built without it. The fail-closed path is what makes that a refusal
rather than a free-for-all.

### Capacity cannot be oversold

`claimSlot` locks the vendor row `FOR UPDATE`, counts open slots, decides, then
inserts — one transaction at `read committed`, the same pattern as
`svc-academy`'s seat claim. The proof is
`src/vendor-slots.test.ts`: eight simultaneous claims against a tier of three
admit exactly three and refuse five by name. **That suite needs Postgres and
skips without it** — a local run with no Docker has not proved this.

The stake lookup happens **before** the lock, deliberately: it is a network call,
and holding the vendor's busiest row across one would serialise every claim behind
svc-token's latency. A slightly stale ENTITLEMENT can only admit a claim the
vendor was entitled to moments ago; what must be fresh is the OCCUPANCY, and that
is counted inside the lock.

`ref` names what the slot is for and makes a claim idempotent — a retried request
must not consume a second slot for the same listing, which is overselling by a
different route. Stage 3 sets it to a listing id.

### Release, and why there is no unstake subscriber

Slots are released three ways: the vendor releases one, or an operator moves them
out of `approved` (released in the SAME transaction as the transition — split
across two, a crash leaves a suspended vendor holding every slot), or **they stop
counting** because capacity is re-derived on read.

That last one is the honest mechanism for unstaking. svc-market never learns that
somebody unstaked: there is no accepted bus subject for it, `event-wiring.mjs`
correctly reds on a subject with no publisher, and polling svc-token on a timer
would be a second source of truth that is wrong between ticks. So `slots` reports
`usable = min(held, capacity)`, and `0` for anyone not `approved`. A vendor who
drops to Base reads `usable: 0` immediately, which is what makes "under-staked
vendors cannot present as listed" hold whether or not a release ever happened.

## Events

**None published, none consumed — still true at Stage 2.** No accepted bus subject
exists for vendor lifecycle, and `packages/events` is not a dependency of this
service. Declaring a subject with no publisher or subscriber is an orphan the
wiring gate correctly refuses; connecting to NATS to publish nothing would add a
boot dependency that can fail in exchange for no capability. When a subject is
accepted, it lands in an events PR first.

That includes the unstake event a slot release would otherwise want. There is no
subscriber wiring for one, so Stage 2 re-checks stake at claim time and on every
read instead — see "Release" above.

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

`market.vendor_slots` — one row per claimed slot, released by setting
`released_at` rather than by deletion, so occupancy stays a `COUNT` over live rows
instead of a maintained counter that can drift. **No capacity, tier or threshold
column** — that is svc-token's, read live. A partial unique index on
`(vendor_id, ref) WHERE released_at IS NULL` makes "one open slot per listing" a
database fact for any future path that does not take the lock.

A slot table rather than counting listings, because there are no listings:
`market.commerce` is a different mountain and Stage 3 is not built, so deriving
capacity from a table that does not exist would make the oversell guarantee
untestable — the one thing this stage is for. Stage 3 attaches a listing by
writing its id into `ref`.

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
