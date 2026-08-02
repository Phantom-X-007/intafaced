# apps/admin — Operator Console

The §14.6 surface: _"Admin controls: kill-switch + config surface in `apps/admin`."_ Until this app existed,
every module shipped with an unverifiable checkbox against that line.

Next.js 15 App Router, hand-scaffolded (no `create-next-app` — it fights the repo tsconfig and prettier).

```bash
pnpm --filter @intafaced/admin dev     # http://localhost:3100
pnpm --filter @intafaced/admin build
pnpm --filter @intafaced/admin typecheck
```

## Doctrine

- **No money logic.** This app reads configuration and issues operator commands. It never computes a balance,
  never posts an entry, and imports nothing from `@intafaced/ledger-client`.
- **No duplicated truth.** Flags come from `FLAG_REGISTRY`, resolution from `resolveAll()` / `isEnabled()`,
  geo rules from `JURISDICTION_MATRIX`, decisions from `checkAccess()`. The console cannot drift from what the
  services enforce, because it holds no copy of what they enforce.
- **No hardcoded colour.** Every value is an `--if-*` custom property from `@intafaced/ui/tokens.css`. Tints
  are `color-mix()` against those tokens. There is not one hex literal in `src/app/globals.css`.
- **Nothing cached.** `export const dynamic = 'force-dynamic'` in the root layout. A stale kill-switch board is
  worse than no board.

## Screens

| Route           | What it does                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`             | Kill-switches. Every flag grouped by module, resolved at the current `LAUNCH_DROP`, with the reason it resolved that way. `ledger.posting` gets its own alarm panel. |
| `/launch`       | The §11 drop table, plus "what would be live at drop N" resolved against a chosen drop.                                                                              |
| `/jurisdiction` | Counsel-review status per matrix entry, the effective module × region rule grid, and a live `checkAccess()` readout.                                                 |
| `/ledger`       | Freeze / unfreeze / reconcile. Freeze requires a written reason, a typed confirmation phrase, and an explicit acknowledgement.                                       |

## Friction is proportional to blast radius

- `reconcile` — read-only on the book. One click.
- `unfreeze` — resumes value movement. One acknowledgement.
- `freeze` — stops the platform. Reason (≥ 12 chars) **and** the literal phrase `FREEZE LEDGER` **and** a
  checked acknowledgement. All three, or the button stays dead.
- `ledger.posting` off — same reasoning on the kill-switch board: the switch is locked until the operator
  acknowledges the platform-wide blast radius in the panel above it.

## Wired (live)

**Module kill-switches** reach svc-edge through this console (#186 + A-P5-OPS):

| Console route                 | Edge                              | Env                                                       |
| ----------------------------- | --------------------------------- | --------------------------------------------------------- |
| `GET/POST /api/kill-switch`   | `/admin/kill-switches`            | `EDGE_URL` + `ADMIN_OPERATOR_TOKEN` (`admin:write` + MFA) |
| `GET/POST /api/ledger-freeze` | `/admin/ledger/freeze` · unfreeze | `EDGE_URL` + `ADMIN_TREASURY_TOKEN` (`admin:treasury`)    |

The `/` board **loads live disabled modules** and **posts module kill/enable** with a required reason when the
control plane status is `reachable`. Per-flag rows remain session-staged (flag store §13).

Operator runbook: [`docs/OPS-KILL-SWITCH-RUNBOOK.md`](../../docs/OPS-KILL-SWITCH-RUNBOOK.md).

## Still not wired (honest residual)

`src/lib/operator-commands.ts` still stubs **ledger reconcile** (and the Ledger ops page still uses those stubs
for freeze/unfreeze UI — prefer `/api/ledger-freeze` when wiring that screen). Every simulated result says so
on its face; no invented money number.

There is no auth in front of this app yet. Tokens stay server-side; the console itself must sit behind
operator SSO before it is deployed anywhere reachable (§13).

**Optional BFF gate (until SSO):** set `ADMIN_BFF_SHARED_SECRET` and inject header
`x-intafaced-admin-bff: <secret>` from the reverse proxy after SSO. When unset, only network ACL
protects `/api/kill-switch` and `/api/ledger-freeze`. See `docs/OPS-KILL-SWITCH-RUNBOOK.md`.

**Edge kill restart durability (not multi-replica):** svc-edge may set `EDGE_KILL_STATE_PATH`
(default `.data/edge-kill-state.json`) so a single-host bounce keeps incident kills. Multi-edge
shared state remains §13.

Strings are not i18n-keyed. §14.4 asks for that on user-facing copy; this console has one audience — the
operator — and keying it before the catalogue exists would add indirection without adding a reader. It is a
deliberate deviation, not an oversight, and it is listed on the DoD gate's manual sign-off block.

## Gaps found in `packages/config`

Recorded here because the console had to work around each of them.

1. **No provenance on flag resolution.** `resolveAll()` answers "is it on?", never "why?". On a kill-switch
   board the second question is the one that matters. `src/lib/flag-state.ts` derives it by re-asking
   `isEnabled()` with narrowed contexts — correct, but it should be a `explain(key, ctx)` in `flags.ts`.
2. **`DROP_ORDER` is private.** There is no exported way to compare two drops, so ordering is read off the
   `DROPS` tuple with `indexOf`.
3. **Drops have no labels.** §11 names the six phases (Tease, Blueprint, Lobby preview, Soft launch, Public
   drop, Seasons); the code has only `'0' | 'I' | …`. `src/lib/drops.ts` carries them for now.
4. **`ruleFor()` is private.** Any UI that renders the _effective_ rule rather than a yes/no decision has to
   recompose `entry.modules?.[m] ?? DEFAULT_MODULE_RULES[m]` itself. See `effectiveRule()` in
   `src/components/jurisdiction-board.tsx`.
5. **`checkAccess()` returns `requiredTier` only on denial.** An allowed decision cannot report the tier that
   was required, so the console cannot show "allowed, and this is what it took".
6. **Two modules have no flag at all** — `market` and `indexer`. `tooling/ci/dod-gate.mjs` fails a service
   whose module id never appears in `flags.ts`, so both are a blocked Definition of Done the day their service
   lands. The console lists them under "Modules with no kill-switch".
