# AGENT EXECUTION PROTOCOL

**Binding on every agent, every PR, every schema change. §15 of `INTAFACED_DEFINITIVE_BUILD.md`.**

---

## 0 · Before you touch anything

1. Read `INTAFACED_DEFINITIVE_BUILD.md`. It is the law, not context.
2. Read the target service's `README.md`.
3. Read this file.

If the task is ambiguous, **the doctrine (§0) decides**. If the doctrine does not decide, **stop and ask D.** Do not guess on money, custody, or jurisdiction.

---

## 1 · Scope of a task

**One service per task.** A PR touches one `services/*` directory plus, at most, its own tests and README.

Cross-service work is **two PRs, in order**:

1. A `packages/contracts` and/or `packages/events` PR that declares the new interface or event. Reviewed on its own.
2. The service PR that implements against it.

Never the reverse. Never both at once. The contract is the design review.

---

## 2 · Hard prohibitions

These are not style preferences. A PR that does any of them is rejected without discussion.

| Never                                                              | Why                                                                                                                   | Instead                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Write raw SQL against another service's tables                     | §2 — services never import each other's schemas. The dev DB enforces this with per-service roles; production will too | tRPC via `packages/contracts`, or an event via `packages/events`  |
| Move value outside `packages/ledger-client`                        | Doctrine §0.6 — ledger is law                                                                                         | Add a recipe in `packages/ledger-client/src/recipes/`             |
| Hold a balance in your service                                     | Doctrine §0.6 — no module holds its own balance                                                                       | An account kind in the ledger                                     |
| Store money in a `number`                                          | 0.1 + 0.2 ≠ 0.3, and the book reconciles to 18dp                                                                      | `parseAmount` / `formatAmount`, `numeric(38,18)`                  |
| Assemble ledger entries inline                                     | Recipes are the reviewable unit of a money path                                                                       | Call or write a recipe                                            |
| Publish an undeclared NATS subject                                 | §10 — the bus is a contract                                                                                           | Add it to `packages/events/src/catalog.ts`                        |
| Name a partner or model vendor in user-facing copy                 | Doctrine §0.7                                                                                                         | Identity Blueprint · Sovereign Intelligence · Neural Engine       |
| Import `ledger-client` write recipes from a Protocol Plane service | Doctrine §16.10 — provably non-custodial                                                                              | `ReadOnlyLedgerClient`, or reconsider the design                  |
| Add a fourth shared system                                         | Doctrine §0.3 — Identity, Balance, Token. That is all                                                                 | Redesign. The need for a fourth means the design is wrong         |
| Leave a "temporary" anything                                       | Doctrine §0.1 — never half done                                                                                       | Finish it, or add a §13 socket entry and reference it in the TODO |

---

## 3 · Every PR must pass

```bash
pnpm typecheck        # no `any` escapes, no implicit widening
pnpm test             # unit + invariant suites
pnpm db:check         # migrations reversible, journal consistent
pnpm scan:brand       # Doctrine §0.7
pnpm scan:custody     # Doctrine §16.10
pnpm gate <service>   # the full §14 Definition of Done
```

CI runs all six. A red gate is not a discussion.

---

## 4 · Writing a service

Follow `tooling/agent-protocol/SERVICE_TEMPLATE.md`. The shape is not optional — uniformity is what lets an agent work in `svc-pay` on Monday and `svc-academy` on Tuesday without re-learning anything.

```
services/svc-<name>/
├── README.md              # API contract · Events · Ledger recipes (required by §14)
├── package.json
├── tsconfig.json
├── drizzle.config.ts      # from drizzleConfig({ schema: '<name>' })
├── drizzle/               # migrations + .down.sql reversals
└── src/
    ├── index.ts           # boot: env → db → bus → tracing → server
    ├── env.ts             # serviceEnvSchema + this service's own slice
    ├── db/schema.ts       # drizzle tables — THIS SERVICE'S SCHEMA ONLY
    ├── router.ts          # tRPC router, implements the contract type
    ├── events.ts          # publishers and consumers
    └── <domain>/          # the actual work
```

---

## 5 · Money paths

A "money path" is any code that leads to `ledger.post()`. It carries stricter rules:

- **≥ 95% unit coverage.** Not aspirational — measured.
- **Every recipe has an invariant test.** Sum-to-zero, no negative available, no stranded funds on any branch.
- **Every failure branch is tested.** Insufficient funds, rail failure, dispute resolution, partial fill, cancel-during-fill.
- **Idempotency keys are business keys.** `deposit:crypto-native:0xabc`, never `crypto.randomUUID()`. A retry must find the original.
- **Trace attribute `intafaced.money_path=true`** so the collector never samples it away.

Ask of every money path: _if this crashes exactly here, whose funds are stranded?_ If the answer is anyone's, the design is wrong.

---

## 6 · Events

- Subject: `intafaced.<service>.<entity>.<verb>`. Past tense. Declared in the catalog.
- Consumers are idempotent. Wrap with `idempotent(handler, store, scope)` — at-least-once delivery is the only delivery.
- Payloads are versioned. Breaking a payload = new version + both running until consumers migrate.
- Money amounts are decimal strings in payloads. Always.

---

## 7 · Jurisdiction and custody

Before serving any user-facing operation:

```ts
const decision = checkAccess({ module, plane, region, kycTier });
if (!decision.allowed) throw forbidden(decision.reason);
```

Or declare it on the procedure: `scopedProcedure('trade:write', { module: 'trade' })`.

**The sovereignty law (§22) is not a policy toggle — it follows custody:**

- Platform never holds the asset → permissionless. No KYC. No account gate.
- Platform holds the asset or touches fiat/card rails → tiered verification per the matrix.

If you find yourself writing a KYC check on the Protocol Plane, stop. Either the module is custodial and belongs on the Fiat Plane, or the check is wrong.

---

## 8 · Definition of Done

A module ships when `pnpm gate <service>` is green **and** the manual checklist it prints is signed. Not before.

Doctrine §0.1: _"A module ships when its Definition of Done passes — not before, and nothing 'temporary' survives to the next phase."_
