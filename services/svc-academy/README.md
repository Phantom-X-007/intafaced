# svc-academy

**Live lobbies with capacity tiers (§8.3, §XIII)** plus a **thin curriculum catalog** (list + content path). Rooms gated free / staked / invite, sessions inside them, presence, a serializable 2D scene, and Blueprint-path playbooks/lessons.

> §8.3: _"Lobbies: rooms (capacity tiers: free/staked/invite), stage + chat + shared charts via ws-gateway; streaming ingest v1 = LiveKit self-hosted (WebRTC SFU, self-hosted per sovereignty; behind `StreamProvider` interface)."_

**Shipped here.** Lobbies (`academy.lobbies`) and thin curriculum READ (`curriculum` + `curriculumItem` — A-P5-2).

**Deliberately not finished here**, each for a stated reason:

| Absent                                                | Why                                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live audio/video                                      | There is no SFU in this stack and no credential for one. The provider is `none` and **refuses** — see below.                                      |
| Full DERIV//DESK library (20 playbooks + 3 workbooks) | Proprietary library is **not in this monorepo**. Day-one spine is platform-native seed so the API is real; full import is residual, not invented. |
| Progress, certifications, XP                          | Need `academy.certs` + identity rank. Catalog is read-only — no completion write.                                                                 |
| Ambassador residencies and per-session IFC pay        | **Money.** Needs ledger recipes that do not exist. A stubbed pay path that looks finished is worse than an honest gap.                            |
| Tournaments, seasonal ladders, prize pools            | Money again, and gated on the season engine.                                                                                                      |

---

## This service is `custodial: false`, and the deployment is part of the proof

There is **no `LEDGER_URL`** in its environment and no ledger client in the process. It holds no credential that could reach anything which moves value — the same argument svc-dex's compose block makes. When ambassador pay lands (§8.3 "per-session IFC pay + sub revenue share (ledger recipes)"), it arrives as recipes in `packages/ledger-client` and a `LEDGER_URL`, as its own reviewable change.

The only `numeric(38,18)` column in the `academy` schema is `rooms.min_stake`, and it is a **threshold, not a balance** — a number this service compares against a stake it reads from svc-token, and never stores. It is `numeric(38,18)` because a threshold compared against a scaled amount must carry the same scale; it is a scaled `bigint` in memory and a decimal string on the wire, like every other amount in the OS.

---

## Who may take a seat

One pure function, `decideSeat()`, is the whole rule — read by the join path, by the "can I join" badge, and by its tests, so they cannot drift apart.

| Room access | Admitted when                                  |
| ----------- | ---------------------------------------------- |
| `free`      | there is a seat left                           |
| `staked`    | `stakeOf(caller) >= room.minStake`, and a seat |
| `invite`    | a live invitation, and a seat                  |

Two decisions worth naming:

- **The gate is checked before the seat count.** Telling somebody a room is full when they were never eligible sends them back to wait for a seat they could not use; telling them they need to stake first is something they can act on.
- **The host is admitted unconditionally.** A host who drops and reconnects would otherwise find their own session full — the seat they vacated having been taken while they were away — leaving the room with no stage. It is also why an ambassador running a staked room does not have to stake into it.

The stake gate **fails closed**, but it is only consulted for `staked` rooms (`needsStakeCheck`). That is what keeps an unreachable svc-token from emptying the free and invite-only lobbies too.

The seat itself is claimed under `SELECT … FOR UPDATE` on the session row, so two people racing for the last seat cannot both get it. The **gate** is evaluated before that lock is taken, deliberately: a stake lookup is a network call, and holding the busiest row in a live lobby across one would serialise every join behind svc-token's latency.

---

## Who may open a room — and why it is not a scope

`academy:write` is issued to every session (`packages/auth/src/scopes.ts`), because taking a seat is a write and a lobby nobody may sit in is not a lobby.

Hosting is a different question, and §4.1 already answered it: `rank_thresholds.perks` is "the machine-readable perk table other services query", and the field it carries for this service is **`lobbyHostRights`** — false at ranks 0–3, true from rank 4 (`services/svc-identity/src/rank/thresholds.ts`). `createRoom` reads it from svc-identity over the internal S2S secret and refuses without it.

Had hosting ridden on the scope, issuing `academy:write` would have handed room creation to every account on the platform in the same commit. §XIII's model is ambassadors and operators running rooms, not anyone with a login.

The perk is checked on `createRoom` **and nowhere else**. `invite`, `scheduleSession`, `startSession`, `endSession` and `updateScene` check `assertHost` against a room the caller already owns. Rank can fall, and a host whose rank slipped mid-residency must still be able to end the session they are running and empty the room — re-checking the perk on `endSession` would strand live attendees in a session nobody is allowed to close.

Like the stake gate, it **fails closed**: an unreadable perk table refuses hosting rather than admitting it, because the alternative is opening room creation to the whole platform for the length of an svc-identity outage.

---

## Streaming is `none`, and says so

`ACADEMY_STREAM_PROVIDER` accepts one value in this build: `none`. §8.3 names LiveKit self-hosted as the v1 ingest; **there is no LiveKit deployment in this environment and no API key for one.**

So `NullStreamProvider` **refuses by name** rather than returning a plausible token. A stub that answered `{ url: 'wss://…', token: 'dev' }` would let a lobby open, let attendees take seats, and fail silently in every browser — which reads to the user as "the platform is broken" and to an operator watching `/health` as nothing at all. `src/stream/provider.test.ts` exists to keep that property when a real provider is added beside this one.

Lobbies still run without it: seats, presence, capacity, invites and the 2D scene canvas need no provider, which is why `join` never calls one.

`/ready` reports `stream.usable: false` rather than 503. A lobby without an SFU is a degraded lobby, not a dead service, and 503 would take the Academy out of the fleet over a feature the rest of it does not need. Tracked as §13 socket `socket.stream-provider`.

---

## API

tRPC, mounted at `/trpc`, reached through svc-edge at `/api/academy` (port 4016).

| Procedure                     | Scope           | Purpose                                                     |
| ----------------------------- | --------------- | ----------------------------------------------------------- |
| `health`                      | public          | Liveness                                                    |
| `curriculum`                  | `academy:read`  | List day-one spine (filter by Blueprint path / kind)        |
| `curriculumItem`              | `academy:read`  | One playbook/lesson/workbook including markdown body        |
| `rooms` / `room`              | `academy:read`  | Lobbies and their terms                                     |
| `session`                     | `academy:read`  | One session and its live occupancy                          |
| `join` / `leave`              | `academy:write` | Take or vacate a seat                                       |
| `streamCredential`            | `academy:write` | Join token for the stage — refused while provider is `none` |
| `createRoom`                  | `academy:write` | Host a lobby — **also gated on §4.1 `lobbyHostRights`**     |
| `invite`                      | `academy:write` | Invite somebody to an invite-only room (host only)          |
| `scheduleSession`             | `academy:write` | Schedule a session in a room (host only)                    |
| `startSession` / `endSession` | `academy:write` | Host controls                                               |
| `updateScene`                 | `academy:write` | Write the 2D scene (host only)                              |

### Curriculum (thin)

- Paths are exactly Blueprint `curriculumPath`: `foundations` · `markets` · `builder` · `sovereign`.
- Kinds: `playbook` · `workbook` · `lesson`.
- Pure in-process catalog (`src/curriculum/catalog.ts`) — no DB table, no progress, no money.
- Unknown slug → `academy.curriculum_not_found` (NOT_FOUND).

A seat belongs to `ctx.principal.userId`. **No procedure takes a userId from the input except `invite`**, where naming somebody else _is_ the operation — and that one is host-only, so the caller must already own the room. The scene is written **whole** by the host, not merged per attendee: merging would need a conflict model this does not have, and half a merge is a room that renders differently for different people.

---

## Events

**Publishes:** none. **Consumes:** none. **No NATS connection at all**, which is worth stating because most services here have one — the §8.3 event this service will eventually emit is `intafaced.identity.xp.earned` on certification, and certification ships with the curriculum. Connecting to the bus to publish nothing would add a boot dependency that can fail, in exchange for no capability.

**Reads over HTTP** (both authenticated with the shared internal service secret):

- svc-token `/internal/stake/:userId` — staked lobbies only
- svc-identity `/internal/rank/:userId/perks` — `createRoom` only

---

## Ledger

**None.** This service uses no ledger recipes and moves no value — see the custodial note at the top. There is no paid entry path in this PR: the `staked` tier is a **threshold test against a stake svc-token already holds**, not a payment, so nothing is ever debited, held or escrowed here, and there is no in-flight state a crash could strand.

That is the answer to the question this codebase asks everywhere — _if the process dies exactly here, whose money is stranded and how does it come back?_ — and the answer is nobody's, because no money entered. If entry ever becomes **paid** rather than stake-gated, that answer changes, and it arrives as ledger recipes plus a `LEDGER_URL` in its own reviewable change.

---

## Testing

| Suite                            | Covers                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/access/room-access.test.ts` | The seating rule: every access tier, the ordering of refusals, host bypass, invite expiry |
| `src/host-rights.test.ts`        | The §4.1 hosting perk, and that every unreadable answer refuses                           |
| `src/stream/provider.test.ts`    | That no fabricated join credential can leave the module                                   |
| `src/curriculum/catalog.test.ts` | Day-one spine non-empty, path/kind filters, content body, unknown slug null               |
| `src/router.mount.test.ts`       | The mount boundary, scope enforcement, curriculum surface, real rather than 404           |

All five are pure and need **no database** — none opens a connection, and none points at the shared `intafaced` instance.

The service's SQL paths are exercised through the fleet's e2e suite rather than a per-service Postgres harness: this service holds no value, and its failure mode is an empty room rather than a lost balance, so the harness cost is better spent on services that move money. The one SQL path that would repay a harness is the capacity race under `FOR UPDATE`, and that is the honest gap in this suite.
