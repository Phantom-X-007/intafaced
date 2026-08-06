# svc-agents

**The agent fleet runtime and model gateway (§8.2).** Phase 5.

Owns four things: a provider-agnostic model gateway, a per-task routing table, exact per-user metering billed through the ledger, and the `agent_actions` audit trail that makes an agent accountable.

**What this service is not:** it is not an agent. Navigator, Support, Market Scanner and Merchant are separate work that registers a guardrail against this service and drives `openSession → think → act → settle → closeSession`. This PR is the runtime they will run on.

It also holds no balances and prices nothing it does not have a rate for. Metered usage moves value exactly once, through `feeCharge`, into svc-ledger.

---

## The provider is configuration, not code

Doctrine §0.7:

> "No third-party system names anywhere in UI, API responses, or docs shipped to users."

§1 names one vendor's API as the first target for the AI layer and then requires providers to be swappable per Doctrine 5. Reconciling those two produced the central design decision in this service: **the provider's identity lives in deployment configuration and never in source.**

| Layer                           | What it knows                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Runtime, metering, audit, API   | a routing `task`, a logical `providerId`, a model **alias** — all configuration values |
| `providers/upstream.ts`         | the wire protocol shape, and nothing about who is on the other end                     |
| `AGENTS_UPSTREAM_*` env / vault | base URL, auth header, protocol headers, alias → concrete model id                     |

The practical test of whether that is real: **swapping providers is editing env and restarting.** No code change, no different build, nothing to review.

The alternative was to hardcode a hostname and a model id and add this service to `brand-scan`'s allowlist. That would have traded a genuine architectural property for a lint exemption, and would have made swapping providers a code change in the one service that exists to make provider swaps free. The scanner was not weakened; `src/copy.test.ts` asserts the same rule from inside the package, over every file in it.

---

## API

Internal tRPC (§1). Every log query is scoped to `ctx.principal.userId` — an audit trail one user can query for another is a privacy incident wearing a feature's clothes.

| Procedure       | Scope            | Input                                      | Output                                                         |
| --------------- | ---------------- | ------------------------------------------ | -------------------------------------------------------------- |
| `health`        | —                | —                                          | `{ ok, service }`                                              |
| `routes.list`   | `agents:read`    | —                                          | tasks, output ceilings, and the **rate each is billed at**     |
| `agent.get`     | `agents:read`    | `{ agentId }`                              | the guardrail, so a user can read it before granting a session |
| `session.open`  | `agents:execute` | `{ agentId }`                              | session, with the guardrail bound to it                        |
| `session.close` | `agents:execute` | `{ sessionId }`                            | settles open windows, then closes                              |
| `session.log`   | `agents:read`    | `{ sessionId }`                            | every action, i18n-keyed                                       |
| `run.complete`  | `agents:execute` | `{ sessionId, requestId, task, messages }` | text, token counts, cost, the audit row                        |
| `usage.current` | `agents:read`    | `{ sessionId }`                            | what the open window would cost. Bills nothing                 |
| `usage.settle`  | `admin:write`    | `{ sessionId, windowId }`                  | posts the charge. Idempotent                                   |
| `log.mine`      | `agents:read`    | `{ limit }`                                | **the user-visible log** (§8.2)                                |

`requestId` on `run.complete` is supplied by the caller and is the anti-double-bill handle: a client that retries after a timeout reuses it.

Also `GET /health` and `GET /ready`.

### `/ready` — honest, not decorative

| Field                  | Meaning                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `ready`                | Process is up (schema + listen succeeded). Always true after boot.       |
| `providerMode`         | `mock` (default) or `upstream`. **Mock is not production inference.**    |
| `providers[]`          | Logical provider ids + usable/healthy (no vendor names — §0.7).          |
| `meteringEnabled`      | Billing kill-switch. Usage is still recorded when off.                   |
| `tasks`                | Routing task ids currently configured.                                   |
| `usefulPath.available` | Whether a **completion** can leave this process right now.               |
| `usefulPath.task`      | First completion task that is currently servable, or null.               |
| `usefulPath.residual`  | Why not / what this still is not (mock residual, orphan routes, outage). |

A green container with `providerMode: mock` and `usefulPath.available: true` means the gateway answers with the deterministic stand-in. It does **not** mean Navigator / Support / the rest of the product fleet are registered — those agents are separate work. Process stays in the fleet when the engine is down so operators can still read session logs; degradation is `usefulPath.available: false`, not 503.

The thin useful path on the gateway itself is `runUsefulPath` in `src/useful-path.ts` (one completion, no session/ledger). Fleet metering still goes through `openSession → think → settle`.

---

## Events

**Publishes**

| Subject                             | When                          | Payload                                           |
| ----------------------------------- | ----------------------------- | ------------------------------------------------- |
| `intafaced.agents.action.completed` | an agent did something        | session, sequence, kind, task, tool, token counts |
| `intafaced.agents.action.rejected`  | a guardrail refused an action | session, sequence, `refusalCode`, tool/task       |
| `intafaced.agents.usage.settled`    | a metered window was billed   | window, amount, asset, `chargeKey`                |

No payload carries a prompt, an answer, or a model identifier. §10 keeps user content out of general stores and a durable event stream is one; §0.7 keeps vendor names out of anything shipped. Consumers get counts and codes — anything more detailed is a query against `agent_actions` under the caller's own authorisation.

**Consumes** — nothing yet. Compliance screening of refusals (§8.8) consumes `action.rejected` when svc-core-ops lands.

---

## Ledger

| Recipe                   | Reason code            | Accounts                               |
| ------------------------ | ---------------------- | -------------------------------------- |
| `feeCharge` (asset mode) | `agents.usage.metered` | user available → `houseFees('agents')` |

One recipe, one money path: settling a usage window. Nothing else in this service moves value.

The charge is keyed `agent.usage:<sessionId>:<window>`, which the ledger namespaces to `fee:agents:agent.usage:<sessionId>:<window>`. That key is recorded on `usage_windows.charge_key` alongside the resulting `charge_tx_id`, so every charge reconciles against the ledger from either direction.

---

## Metering: exact, and idempotent three times over

### Exact

`usage_records` stores **integer token counts and the rate that was in force** — never a cost. Cost is computed once per `(window, rate)` at settlement, in scaled bigint. No `number` touches a price at any point.

Where the rounding happens is the design, not a detail. A rate is "X per million tokens", so cost is `rate × tokens ÷ 1,000,000`, and that division is the only lossy step:

- **Round per call, then sum** → one rounding unit of error per call, all in the same direction. A chatty session accrues them in proportion to how much the agent spoke.
- **Sum exact counts, then round once per rate** → integer counts sum losslessly, and at most one rounding unit per rate per window remains.

The second is what happens. `usageCost` exists for display and for the spend guardrail; the bill always goes through `windowCost`. A test asserts the gap between the two is real and in the direction claimed.

Direction is `ceil`, matching `mulBps`'s fee convention in ledger-client: a fee that rounds to zero is a fee the house pays. At 18 decimals the bias is bounded at 1e-18 per rate per window.

The rate is snapshotted onto every usage record, so a price change mid-window cannot re-price calls that already happened.

### Idempotent

Three independent layers, in the order they engage:

1. **`usage_records` is unique on `(session_id, request_id)`.** A retried completion inserts the same request id, the insert is discarded, the tokens are counted once. This is the layer that does the work.
2. **The seal.** Settlement seals the window _before_ it touches the ledger, in its own transaction. A sealed window rejects further usage (trigger), so the amount is frozen the instant it is computed.
3. **The ledger key.** Re-posting `agent.usage:<sessionId>:<window>` returns the original transaction rather than a second charge.

**The order matters and is the whole design: seal → post → record the tx id.** Posting first would leave a window a concurrent completion could still grow, so a resumed settlement would compute a larger amount than the ledger had already accepted under that key — and the difference would be invisible on both sides. Sealing first means a crash anywhere after it resumes to the _same_ amount.

A retried completion is still logged — the engine really was called again — but the duplicate row carries zero cost, because zero is what it added to the bill.

### When things break

| Failure                                 | Result                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider is down                        | Refused on health before the request leaves the process. No usage, no charge, logged `failed`                                                         |
| Provider fails mid-call                 | No usage is reported, so nothing is metered. Logged `failed`                                                                                          |
| Provider succeeded, our DB write failed | The house absorbs a call it cannot account for. The user is **not** billed — the only acceptable direction for that error — and the attempt is logged |
| Crash between seal and ledger post      | Resumes to the same sealed amount; the ledger key makes the re-post a no-op                                                                           |
| Usage arrives after settlement          | Rejected by trigger with `agents.window_sealed`, rather than being billed twice or never                                                              |

---

## Guardrails: refused before execution, not after

Each agent declares a toolset and limits. `parseGuardrail` rejects contradictions at write time — a tool granted in a module the agent may not act in is refused where it is written, because a contradiction in a security policy resolves however the enforcement code happens to be ordered.

| Rule                                                                     | Refusal code                |
| ------------------------------------------------------------------------ | --------------------------- |
| Tool not in the declared toolset                                         | `agents.tool_not_declared`  |
| Tool's per-session call budget spent (`0` means disabled, not unlimited) | `agents.tool_call_limit`    |
| Tool's module not granted                                                | `agents.module_not_allowed` |
| Task not in the agent's allowed tasks                                    | `agents.task_not_allowed`   |
| Session action budget spent                                              | `agents.action_limit`       |
| Call's **worst case** would cross the session spend cap                  | `agents.spend_limit`        |
| More output requested than the agent may produce                         | `agents.output_limit`       |
| Tool needs the user's confirmation                                       | `agents.approval_required`  |
| Session closed                                                           | `agents.session_closed`     |

Two properties worth stating:

**The spend cap is checked against worst case, not expected cost.** A ceiling that one unlucky generation can cross is not a ceiling, and the real cost is unknowable until the tokens are already gone. The input estimate used for that check is deliberately pessimistic (3 chars/token, tighter than any real tokeniser) so the guardrail errs toward refusing. The recorded spend is always the provider's exact counts.

**The guardrail is bound at session open.** It is copied onto `agent_sessions.guardrail`, not referenced. Widening an agent's powers must not retroactively legitimise a call an in-flight session already made under narrower terms — the same reason `stakes.multiplier_bps` is snapshotted in svc-token.

---

## The audit log

§8.2's Agentic Law: _"Every action → `agent_actions` table + user-visible log."_ The word doing the work is **every** — an agent that only logs what succeeded produces a record in which nothing ever went wrong. Refusals are appended with the same ceremony as successes, and a refusal without a machine code is rejected by a `CHECK`.

**Append-only, in the database.** A trigger raises on `UPDATE` and on `DELETE`. There is no update path in the service, and a future one would not work either. Correcting a bad row means appending a correcting row, exactly as on the ledger.

`TRUNCATE` is deliberately not trapped: it is an owner-only privilege held by the migration role, not by the runtime role a deployed service connects with, and leaving it available is what lets a test database reset.

**Tamper-evident.** Rows form a per-session hash chain (`prev_hash → hash`), the construction svc-ledger uses for transactions. The trigger stops the service from rewriting a row; the chain makes a rewrite made _around_ the service detectable. `verifyChain` is the check. Neither alone is enough.

**Content is stored as digests, never text.** A prompt is exactly the kind of thing a user did not consent to have retained (§10). A SHA-256 still proves what was sent — replay it, hash it, compare — without this table becoming a transcript archive.

**Every log line is an i18n key plus parameters**, never rendered prose (§14 DoD 4). Storing English would freeze one locale into the audit trail and would be the one place an upstream's error text could reach a screen unnoticed. The catalogue is `src/copy.ts`.

---

## Database constraints as a backstop

The service checks these; the database enforces them regardless.

| Constraint                               | What it catches                                                    |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `agent_actions_no_update` / `_no_delete` | **the audit trail being rewritten by the thing it is a log of**    |
| `usage_records_no_late_usage`            | usage landing in a period that has already been billed             |
| `usage_records_request_idx` (unique)     | a retried completion billed twice                                  |
| `usage_windows_seal_once`                | a settled window re-settled, breaking the ledger reconciliation    |
| `usage_windows_seal_complete_ck`         | a sealed window with no amount or key — unreconcilable             |
| `agent_actions_refusal_coded_ck`         | a refusal nobody can explain afterwards                            |
| `agent_actions_refusal_free_ck`          | a refused action carrying token usage — a bill for work never done |
| `agent_definitions_guardrail_shape_ck`   | a hand-written `INSERT` creating an agent with no declared limits  |

---

## Kill-switches

| Switch                                         | Effect when off                                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agents.premiumTiers` flag (`packages/config`) | metered tiers unavailable — the module-wide gate in the admin console                                                                               |
| `AGENTS_METERING_ENABLED=false`                | billing halts. Usage is **still recorded**: turning metering off must not also destroy the ability to find out what the fleet cost while it was off |
| `agent_definitions.enabled = false`            | one agent stops opening sessions; running ones are unaffected until they close                                                                      |

---

## Configuration

```bash
AGENTS_PROVIDER=mock                     # 'mock' (default) or 'upstream'
AGENTS_FEE_ASSET_ID=IFC
AGENTS_USAGE_WINDOW_MINUTES=60           # must divide 1440
AGENTS_METERING_ENABLED=true

# Only when AGENTS_PROVIDER=upstream. Secrets come from vault in prod (§9).
AGENTS_UPSTREAM_BASE_URL=https://…
AGENTS_UPSTREAM_API_KEY=…                # matches the `_KEY` secret pattern; redacted from logs
AGENTS_UPSTREAM_AUTH_HEADER=x-api-key
AGENTS_UPSTREAM_HEADERS={"…":"…"}        # protocol version pins, tenant ids
AGENTS_UPSTREAM_MODELS={"reasoning-lg":"…"}   # routing alias → concrete model id
AGENTS_ROUTING_TABLE={…}                 # overrides the built-in default table
```

`AGENTS_PROVIDER=mock` is the default deliberately: a developer should be able to run the fleet with no upstream credential, and starting this service by accident must not be able to spend money.

---

## Running it

```bash
docker compose up -d
pnpm --filter @intafaced/svc-agents db:migrate
pnpm --filter @intafaced/svc-agents test
```

## Tests

Pure layers (no database): cost arithmetic, guardrails, adapters, **readiness honesty**, **gateway useful path**. Cost is a pure function of counts and rates, so it is tested exhaustively and cheaply, including the two assertions about _where_ the rounding happens that justify the whole `usage_records` design.

### Residual (honest — not Done by this package alone)

| Gap                                             | Why it is residual                                       |
| ----------------------------------------------- | -------------------------------------------------------- |
| Product agents (Navigator, Support, Scanner, …) | Register guardrails + drive the runtime; not seeded here |
| Production inference                            | Requires `AGENTS_PROVIDER=upstream` + vault credentials  |
| Full premium-tier product surface               | Phase 5 agent product work on top of this runtime        |

The money and audit paths run against real Postgres with the ledger's in-memory reference implementation, which the conformance suite proves equivalent to svc-ledger's Postgres engine (§4.4). Real Postgres because every property worth testing here — append-only, the window seal, the unique request id — lives in the database, and a fake would test the fake.

`src/copy.test.ts` runs the brand law over every file in the package. It spells the forbidden names in pieces so the test that enforces the rule is not the thing that breaks it — which is strictly better than allowlisting the file and carving a permanent hole in the rule in order to test the rule. It also plants a violation and asserts the check catches it: a scanner nobody has seen fail is a scanner nobody should trust.

Failure branches covered: an unrouted task, a route naming an unregistered provider, an engine outage, a transient blip retried, a tool that threw, a guardrail widened mid-session, usage arriving after settlement, and settlement run three times.
