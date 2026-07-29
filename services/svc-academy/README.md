# svc-academy

**Lobbies, curriculum, certifications (§8.3).** Capacity-tiered rooms with a serializable 2D scene, Blueprint-sequenced learning paths, and certifications that publish into the rank ladder as XP.

> §8.3: _"Lobbies: rooms (capacity tiers: free/staked/invite) … paths sequenced by Blueprint … Certifications → XP events + perks."_

**Scope of this PR.** Rooms, sessions, seating, curriculum paths and certifications. **Not started here:** live audio/video (the `StreamProvider` is `none` — see below), tournaments and seasonal ladders, ambassador residency contracts and their IFC pay. The last one is money, and it is the reason this service deliberately has no ledger client at all today.

---

## This service is `custodial: false`, and the deployment is part of the proof

There is **no `LEDGER_URL`** in its environment and no ledger client in the process. It holds no credential that could reach anything which moves value — the same argument svc-dex's compose block makes. When ambassador pay lands (§8.3 "per-session IFC pay + sub revenue share (ledger recipes)"), it arrives as recipes in `packages/ledger-client` and a `LEDGER_URL`, as its own reviewable change.

The only `numeric(38,18)` column in the `academy` schema is `rooms.min_stake`, and it is a **threshold, not a balance** — a number this service compares against a stake it reads from svc-token. It is still `numeric(38,18)` because a threshold compared against a scaled amount must carry the same scale, and storing it as a float is how a gate silently drifts.

---

## Who may take a seat

One pure function, `decideSeat()`, is the whole rule — read by the join path, by the "can I join" badge, and by its tests, so they cannot drift apart.

| Room access | Admitted when                                   |
| ----------- | ------------------------------------------------ |
| `free`      | there is a seat left                             |
| `staked`    | `stakeOf(caller) >= room.minStake`, and a seat   |
| `invite`    | a live invitation, and a seat                    |

Two decisions worth naming:

- **The gate is checked before the seat count.** Telling somebody a room is full when they were never eligible sends them back to wait for a seat they could not use; telling them they need to stake first is something they can act on.
- **The host is admitted unconditionally.** A host who drops and reconnects would otherwise find their own session full — the seat they vacated having been taken while they were away — leaving the room with no stage. It is also why an ambassador running a staked room does not have to stake into it.

The stake gate **fails closed**, but it is only consulted for `staked` rooms (`needsStakeCheck`). That is what keeps an unreachable svc-token from emptying the free and invite-only lobbies too.

---

## Streaming is `none`, and says so

`ACADEMY_STREAM_PROVIDER` accepts one value in this build: `none`. Lobbies run as seats, presence, chat and the 2D scene canvas; a request for a stream credential is **refused by name** rather than answered with a token that cannot connect.

`/ready` reports `stream.usable: false` rather than returning 503. A lobby without an SFU is a degraded lobby, not a dead service — the entire curriculum half works — and 503 would take the Academy out of the fleet over a feature most of it does not use. Tracked as §13 socket `socket.stream-provider`; LiveKit self-hosted is the specced v1 (§8.3).

---

## API

tRPC, mounted at `/trpc`, reached through svc-edge at `/api/academy`.

| Procedure           | Scope            | Purpose                                             |
| ------------------- | ---------------- | --------------------------------------------------- |
| `health`            | public           | Liveness                                            |
| `rooms` / `room`    | `academy:read`   | Lobbies and their terms                             |
| `session`           | `academy:read`   | One session with its attendees                      |
| `curricula`         | `academy:read`   | Published learning paths                            |
| `curriculum`        | `academy:read`   | One path with its items, in order                   |
| `progress`          | `academy:read`   | The caller's progress through a path                |
| `certifications`    | `academy:read`   | The caller's awarded certifications                 |
| `join` / `leave`    | `academy:write`  | Take or vacate a seat                               |
| `streamCredential`  | `academy:write`  | Join token for the stage — refused while provider is `none` |
| `createRoom`        | `academy:write`  | Host a lobby                                        |
| `invite`            | `academy:write`  | Invite somebody to an invite-only room              |
| `scheduleSession`   | `academy:write`  | Schedule a session in a room                        |
| `startSession` / `endSession` | `academy:write` | Host controls                              |
| `updateScene`       | `academy:write`  | Write the 2D scene (host only)                      |
| `enroll`            | `academy:write`  | Enrol on a path                                     |
| `completeItem`      | `academy:write`  | Complete a path item, in sequence                   |
| `certify`           | `academy:write`  | Award the certification for a finished path         |

Host-only paths (`invite`, `scheduleSession`, `updateScene`, session controls) go through `assertHost`. The scene is written **whole** by the host, not merged per attendee — merging would need a conflict model this does not have, and half a merge is a room that renders differently for different people.

### Paths are sequences, not checklists

`assertUnlocked` refuses an item whose predecessors are unfinished. Without it, "path" means nothing: a learner could complete item 12 first and hold a certification for a sequence they never followed. Re-completing an item already done is allowed and is a no-op — revisiting a workbook is not an error.

An **empty path is 0% and unfinished**, never complete. Reporting it complete would certify people for a curriculum nobody has authored yet, which is also why a path with no items cannot be published.

---

## Events

**Publishes:** `intafaced.identity.xp.earned` — one event per certification, the declared way into §4.1's rank ladder (§8.3: _"Certifications → XP events + perks"_).

That subject lives on the **`identity` stream, which svc-identity owns**, so this service declares `ownedStreams: []` and depends on svc-identity in compose. A consumer against a stream whose owner has not created it yet fails at boot — the same ordering svc-trade needs, for the same reason.

**Consumes:** none.

The event's idempotency key is `academy.certification:<curriculumId>:<userId>` — a business key, so one certification per (curriculum, user), forever. A redelivered event finds the original award rather than inflating a rank.

**Reads over HTTP:** svc-token `/internal/stake/:userId` (staked lobbies only).

---

## Ledger

**None.** This service uses no ledger recipes and moves no value — see the custodial note at the top. XP is not value: it is a rank signal published as an event, and it can never be spent, transferred or redeemed.

The recipes this service will need when ambassador pay lands (§8.3 residency contracts, per-session IFC pay, sub revenue share) do not exist yet and are not stubbed. A stubbed money path that looks finished is worse than an honest gap.

---

## Testing

- `src/access/room-access.test.ts` — the seating rule: every access tier, the ordering of the refusals, host bypass, invite expiry.
- `src/curriculum/progress.test.ts` — sequencing, progress arithmetic, certification XP and its idempotency key.

Both suites are pure and need no database. The service's SQL paths are exercised through the fleet's e2e suite rather than a per-service Postgres harness, because this service holds no value and its failure mode is an empty room rather than a lost balance — the harness cost is better spent on services that move money.
