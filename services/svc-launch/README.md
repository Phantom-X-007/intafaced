# svc-launch

**The launchpad (§8.4).** Presale and fair-launch raises, allocation tiers gated on `token.stakeOf`, and vesting schedules held in platform escrow.

> §8.4: _"Launchpad raises: presale/fair-launch configs, vesting schedules enforced by contract + platform escrow, allocation tiers by `token.stakeOf`."_

**What this service is not:** it is not a wallet and it holds no balance. It stores raise terms, tiers, who committed what, and how far a vesting schedule has been released. Every "how much" question is answered by `ledger.balance(...)` at the moment it is asked.

**Scope of this PR.** Raises, tiers, contribution, settlement and vesting only. The rest of §8.4 — token factory, meme factory, NFT mint/auction, RWA issuance — is **not started here** and the UI continues to say so. A raise is the part with money in it; the factories are contract-deployment work that belongs with the audited templates.

---

## Where does the value live?

In svc-ledger. Nowhere else. Concretely:

| Question                                      | Answered by                                                 |
| --------------------------------------------- | ----------------------------------------------------------- |
| How much has this contributor committed?      | `ledger.balance(raiseContributionAccount(user, asset, raise))` |
| How much sale supply is still deliverable?    | `ledger.balance(raiseSupplyAccount(issuer, asset, raise))`   |
| How much is behind this vesting schedule?     | `ledger.balance(vestingEscrow(scheduleId, asset))`           |
| How much has this raise taken in total?       | `SUM(committed)` over contribution rows — a derived query    |
| What has the house earned on launches?        | `ledger.balance(houseFees('launch', asset))`                 |

Three account shapes, and note what is **not** among them: there is no pooled "raise account" holding every contributor's money together. A pooled pot would let one contributor's refund be paid out of another's stake — the same commingling failure P0-3 removed from holds. Contributions escrow **per contributor, per raise**, so "what do we owe this person if the raise fails" is a balance rather than a reconstruction.

Every `numeric(38,18)` column in the `launch` schema is a **term or a watermark** — a cap, a price, a threshold, a released-so-far marker — never a spendable balance.

---

## The shape of a raise

```
draft ──addTier──▶ draft ──open──▶ funding ──close──▶ succeeded ──settle──▶ settled
  │                                   │                    │
  └──cancel──▶ cancelled              │                    └─ failed ──settle──▶ settled (all refunded)
                                      └─ contributors commit here
```

Two rules the state machine exists to enforce:

- **Supply is escrowed before the raise opens.** The issuer's tokens leave their spendable balance at `open`, so a raise can never be selling supply the issuer has since spent. The ledger refuses the lock outright if they do not hold it.
- **An open raise cannot be cancelled.** Once contributors can commit, the window is a promise; it ends by closing — succeeding or failing against its soft cap — never by the issuer changing their mind while holding other people's money. Only a `draft`, which has escrowed nothing, may be cancelled.

---

## API

tRPC, mounted at `/trpc`, reached through svc-edge at `/api/launch`. All money crosses the wire as **decimal strings**.

| Procedure              | Scope           | Purpose                                                              |
| ---------------------- | --------------- | -------------------------------------------------------------------- |
| `health`               | public          | Liveness                                                             |
| `list`                 | `launch:read`   | Raises, optionally filtered by status                                |
| `get`                  | `launch:read`   | One raise with its tiers                                             |
| `allocations`          | `launch:read`   | Allocation lines for a raise                                         |
| `myContribution`       | `launch:read`   | The caller's own commitment and escrowed balance                     |
| `vesting`              | `launch:read`   | The caller's vesting schedules and what is claimable now             |
| `contribute`           | `launch:write`  | Commit to a raise — **escrows value**                                |
| `claim`                | `launch:write`  | Claim vested tokens — **releases value**                             |
| `create`               | `launch:write`  | Create a draft raise (issuer)                                        |
| `addTier`              | `launch:write`  | Add an allocation tier — draft only                                  |
| `open`                 | `launch:write`  | Lock supply and open the window — **moves value**                    |
| `cancel`               | `launch:write`  | Cancel a draft raise                                                 |
| `close`                | `launch:write`  | Close the window and compute allocations                             |
| `settle`               | `launch:write`  | Settle a batch of contributors — **moves value**                     |

Ownership is enforced on every issuer path: `assertIssuer` refuses a caller who is not the raise's issuer, and read procedures resolve `ctx.principal.userId` rather than trusting an id in the input.

### The stake gate

Allocation tiers are resolved by calling svc-token's `GET /internal/stake/:userId`. It **fails closed**: if the stake cannot be read, the commitment is refused. Admitting at the lowest tier instead would sell a staked allocation to someone who does not hold the stake, and unwinding that means asking people to hand tokens back after a raise has settled. Nothing has moved at the moment of refusal, which is exactly why refusal is cheap there and expensive everywhere later.

The stake is read live and never cached — a cached tier keeps admitting somebody after they have unstaked.

---

## Events

**Publishes:** none. **Consumes:** none.

svc-launch connects to no bus, deliberately. It publishes no subject and consumes none, so a raise's facts are queried under the caller's own authority; adding a bus dependency for events nothing subscribes to would be a boot-order risk bought for nothing. When a launch feed is wanted, the subject belongs on a stream this service would then own, and it is a change to make on purpose rather than by leaving a connection open.

**Reads over HTTP:** svc-token `/internal/stake/:userId` (allocation tiers), svc-ledger (all value movement).

---

## Ledger

Every value movement is a recipe in `packages/ledger-client/src/recipes/launch.ts`. This service assembles no entries by hand.

| Recipe                   | When                                        | Movement                                       |
| ------------------------ | ------------------------------------------- | ---------------------------------------------- |
| `raiseSupplyLock`        | `open`                                      | issuer available → issuer supply escrow        |
| `raiseContribute`        | `contribute`                                | buyer available → buyer contribution escrow    |
| `raiseSettleContributor` | `settle`, per contributor                   | both escrows → buyer, issuer, house fees       |
| `raiseRefund`            | `settle` of a failed raise                  | buyer escrow → buyer available                 |
| `raiseSupplyReturn`      | end of settlement, or a failed raise        | issuer supply escrow → issuer available        |
| `vestingRelease`         | `claim`                                     | platform vesting escrow → beneficiary available |
| `vestingFund`            | team/advisor grants (not a raise output)    | grantor available → platform vesting escrow    |

**Settlement is per contributor**, as one atomic transaction each. Both escrows drain in the same transaction as the payout, so there is no instant at which a contributor's money has left escrow but their tokens have not arrived. Per-contributor keys also make settlement resumable: a pass that fails halfway resumes at the contributor it stopped on, and everyone already settled is a no-op.

**Idempotency keys are business facts, never clock readings.** `raiseContribute` and `vestingRelease` carry a `sequence` incremented under a row lock, because a schedule vests continuously — two workers asking microseconds apart under a date key would compute different amounts for the same key, which is the one thing an idempotency key must never allow.

**Fees round in the house's favour** (`mulBps` default `ceil`), matching `tradeFill` and `escrowRelease`. A raise that did not clear its soft cap is refunded in full and takes **no** fee.

---

## Testing

- `src/raise/allocation.test.ts`, `src/raise/vesting.test.ts` — pure allocation and vesting curves, no I/O.
- `src/stake-source.test.ts` — the stake gate's wire format and its fail-closed behaviour.
- `src/launch-service.test.ts` — the money paths, against **its own dedicated Postgres database**.

That last point is deliberate. Other suites here apply their migration to the shared `intafaced` database's schema, which means two checkouts running tests at once mutate each other's schema. This suite creates a database, builds `launch` inside it, and drops the whole thing afterwards — nothing outside it is ever touched.

The ledger in those tests is `MemoryLedger`, the reference implementation the conformance suite proves behaves identically to svc-ledger's Postgres engine (§4.4) — including for the launch recipes, which that suite now covers.
