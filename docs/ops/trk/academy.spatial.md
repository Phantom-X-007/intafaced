# TRK-academy.spatial

**Title:** 2D navigable room canvas, VR-ready scene state  
**Tracker:** `academy.spatial` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `academy.lobbies` (done)  
**Tip freeze:** `origin/main` @ `b3d08931` (re-derive before implement)

## DoD (plain language)

A learner opens a live lobby session and sees a **2D navigable room** (avatars,
stage, presence) driven by the session’s serializable scene state — not a blank
placeholder. Host can update the scene; attendees read the same state. VR is
**not** required for this row; scene JSON stays renderer-agnostic so a later VR
client can consume the same rows (`socket.vr-client`). No money, no SFU
dependency.

## Path on tip

| Area            | Location                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| Service         | `services/svc-academy/`                                                  |
| Scene column    | `src/db/schema.ts` — `sessions.scene` jsonb default `{}`                 |
| Write API       | `updateScene` (`academy:write`, host-only) — `academy-service.ts`        |
| Read            | Session payload includes `scene` on join / session read                  |
| Client residual | **No** monorepo 2D canvas app; `apps/web` lobby directory still residual |
| Socket          | `socket.vr-client` depends on this row                                   |

**Tip residual:** backend **scene store + host write already ship** with
lobbies. Missing is (1) a **typed scene contract** (today `Record<string, unknown>`),
(2) a **client canvas** that renders/navigates it, (3) presence→avatar mapping
if product wants live peeps on the map. SFU/stream is separate (`socket.stream-provider`).

## Blocked by

| Blocker     | Notes                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Soft        | Edge/browser path to academy for a real client (shell residual)        |
| Product law | Minimal scene schema (positions, stage id, props) — Denon/Nitro decide |
| Not blocked | Lobbies, host assert, jsonb scene column, host-whole-write model       |
| Money       | None — keep non-custodial                                              |

## First PR size (if free)

**S:** publish a zod scene contract in `packages/contracts` (or academy-local
shared schema), validate on `updateScene`, golden tests for round-trip empty +
minimal room. **S–M follow-up:** thin React/canvas viewer in `apps/web` (or
academy shell) reading `session.scene` + host editor — one service surface per
PR. Do **not** mark done until a human can move/see presence on a real session.
VR client stays socket until this canvas proves the serializable model.
