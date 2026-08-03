# Secret rotation readiness

**Date:** 2026-08-03 · **Branch:** `fix/secret-rotation-readiness`
**Predecessor:** [`A1.4-WALLET-SECRETS-PERIMETER-2026-07-30.md`](A1.4-WALLET-SECRETS-PERIMETER-2026-07-30.md) — the audit that found the committed credentials. This document is the other half: what the owner needs in order to rotate them safely.

**I did not rotate anything.** No secret was generated, changed, invented or placed in this repository, including as a placeholder. **No secret's value appears anywhere in this document** — everything is referenced by variable name, file and line. That boundary is the point of the work: the owner rotates, and this makes it a routine operation instead of a frightening one.

Two things in here are new findings rather than restatements. They are in §4, and §4 is the section to read first if you only read one.

---

## 1 · Inventory — every secret the platform needs to run

Sources: `.env.example`, `docker-compose.apps.yml`, `packages/config/src/env.ts`, and all seventeen `services/*/src/env.ts`. Machine-derived, then read back by hand.

"Absence fatal?" is the column that matters. A secret with a **working default** is the dangerous kind: it means a deployment can run, look healthy, and be running on a value that everyone with repository access already knows.

### 1.1 · Fleet-wide — one value, many services

| Secret                    | What it is                                                                                 | Shape                | Default             | Absence                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------ | -------------------- | ------------------- | ----------------------------------------------------------------- |
| `EDGE_PRINCIPAL_SECRET`   | HMAC key over the principal svc-edge forwards. Edge signs; every mounting service verifies | `z.string().min(32)` | **none**            | **Fatal at boot.** Compose `:?` also refuses to start the stack.  |
| `INTERNAL_SERVICE_SECRET` | Shared secret on the internal money plane. svc-ledger verifies; every caller sends it      | `z.string().min(32)` | **none**            | **Fatal at boot.** Compose `:?`.                                  |
| `JWT_ACCESS_SECRET`       | Access-token signing key. svc-identity mints, svc-edge verifies                            | `z.string().min(32)` | **none** (see §2.3) | **Fatal at boot** in three of four consumers; optional in svc-ws. |

`INTERNAL_SERVICE_BODY_BIND` is not a secret but governs the same plane: `accept-both` by default, deliberately the weaker value so a rolling redeploy does not 401 mid-flight. See `docs/decisions/s2s-body-bind.md`.

### 1.2 · Per-service

| Secret                            | Service       | Default  | Absence                                                                                                                              |
| --------------------------------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `PAY_CRYPTO_WEBHOOK_SECRET`       | svc-pay       | **none** | **Fatal at boot.** A forged delivery asserts money moved that did not.                                                               |
| `PAY_CARD_SANDBOX_WEBHOOK_SECRET` | svc-pay       | **none** | **Fatal at boot.** Same reason; sandbox money is still a real state machine.                                                         |
| `PAY_CRYPTO_DEPOSIT_MNEMONIC`     | svc-pay       | none     | Optional. Unset ⇒ no live crypto rail. Set ⇒ the live-rail cross-field rules require the rest of the block.                          |
| `PAY_CRYPTO_HOT_WALLET_KEY`       | svc-pay       | none     | Optional. **This is a signing key** — the only one in the TypeScript fleet. `0x` + 64 hex, enforced.                                 |
| `AGENTS_UPSTREAM_API_KEY`         | svc-agents    | none     | Optional while `AGENTS_PROVIDER=mock` (the default). With `=upstream`, **fatal at boot** — `index.ts:48` throws by name.             |
| `NOTIFY_EMAIL_GATEWAY_TOKEN`      | svc-notify    | none     | Optional alone. **Fatal at boot if the matching `_URL` is set** — a gateway URL with no credential is an open relay (`superRefine`). |
| `NOTIFY_PUSH_GATEWAY_TOKEN`       | svc-notify    | none     | Same all-or-nothing pairing.                                                                                                         |
| `NOTIFY_SMS_GATEWAY_TOKEN`        | svc-notify    | none     | Same all-or-nothing pairing.                                                                                                         |
| `BLUEPRINT_ENGINE_API_KEY`        | svc-blueprint | none     | Optional. `BLUEPRINT_ENGINE_MODE` is a **mode, not a fallback** — `mock` serves deterministic profiles rather than pretending.       |
| `BLUEPRINT_CARD_RENDERER_API_KEY` | svc-blueprint | none     | Optional.                                                                                                                            |

**Every required secret in this table has no default.** That is not luck — `packages/config/src/env.ts` declares them without one on purpose, and `loadEnv` throws listing every problem at once. Nothing in this branch weakens any of it.

### 1.3 · Datastore credentials

`DATABASE_URL` and the eleven `TEST_DATABASE_URL_*` variables use the repo's matched dev pair (`svc_trade:svc_trade`). A password identical to the username beside it discloses nothing, and A1.4 §2 argues that at length. **It is a perimeter question, not a secrets question** — and the perimeter findings P2/P4 (MySQL on `0.0.0.0:5506`, unauthenticated MongoDB on `0.0.0.0:57017`) are still open.

### 1.4 · Vendored Java platform

Roughly forty variables, all documented and commented out at the foot of `.env.example`, all with **no default in the properties files** so an unset one stops the service. The live ones are enumerated in A1.4 §2 and reproduced in the owner action list below.

**One is a `:-` default and should not be:** `COINEX_REDIS_PASSWORD:-coinex_dev_only` in the vendored exchange compose file guards the store holding exchange HTTP sessions, published on `0.0.0.0:6381`. A1.4 flagged it as P3; it is still there. A weak default on a session store is the §1 hazard in its purest form.

---

## 2 · Blast-radius map

**This is the deliverable.** The question it answers is the one that makes people postpone rotations: _if I change this value, what stops working, and what else must change at the same time?_

### 2.1 · The three shared secrets, and who must move together

| Secret                    | Must be **identical** across                                                                                                                                          | Count |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `EDGE_PRINCIPAL_SECRET`   | svc-edge **+** svc-academy, svc-agents, svc-bank, svc-blueprint, svc-dex, svc-identity, svc-indexer, svc-notify, svc-p2p, svc-pay, svc-protocol, svc-token, svc-trade | 14    |
| `INTERNAL_SERVICE_SECRET` | svc-ledger **+** svc-academy, svc-agents, svc-bank, svc-identity, svc-matching, svc-p2p, svc-pay, svc-token, svc-trade                                                | 10    |
| `JWT_ACCESS_SECRET`       | svc-identity, svc-edge, svc-ledger, svc-ws                                                                                                                            | 4     |

Deliberately **not** holding these, and each absence is load-bearing rather than an oversight:

- **svc-ws** holds no `EDGE_PRINCIPAL_SECRET` and no `INTERNAL_SERVICE_SECRET`. That absence is precisely why it is allowed to be a second internet-facing port (`services/svc-ws/README.md`).
- **svc-edge** holds no `INTERNAL_SERVICE_SECRET` and no `DATABASE_URL`. The front door cannot reach the money plane.
- **svc-dex** and **svc-protocol** hold no `INTERNAL_SERVICE_SECRET` — non-custodial by construction; the environment is part of the proof.

### 2.2 · What breaks if one is rotated alone

| Secret                    | Symptom of a partial rotation                                                                                                                                                                                | Who sees it                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `EDGE_PRINCIPAL_SECRET`   | Every authenticated request to a service still on the old value returns **401**. Public/unauthenticated paths keep working.                                                                                  | Users, immediately. Loud.                                                                |
| `INTERNAL_SERVICE_SECRET` | Every `ledger.post` from a stale caller **401s**. The platform starts, health checks pass, and **no unit of value can move**.                                                                                | **Nobody, until someone tries to trade.** Health checks do not exercise the money plane. |
| `JWT_ACCESS_SECRET`       | Rotate svc-identity alone: every login succeeds and every subsequent request is anonymous — _"logged in but nothing works"_, with **no error in any log**. Rotate svc-edge alone: all existing sessions 401. | Users, confusingly. Operators, not at all.                                               |

`INTERNAL_SERVICE_SECRET` is the dangerous one: **a healthy-looking platform that cannot move money.** Any procedure for it must include a money-path probe, not a health check.

### 2.3 · Rotation procedures

Because all three are symmetric HMAC secrets with no versioning, none supports a graceful two-key overlap today. The safe procedure is therefore _one edit, one restart of the whole affected set_.

**`EDGE_PRINCIPAL_SECRET` — 14 services**

1. Set the new value in `.env` (compose reads one variable; all 14 blocks reference it by anchor, so this is genuinely one edit).
2. `pnpm platform:down && pnpm platform:up` — restarting a subset guarantees a mixed fleet and 401s.
3. Verify: log in through svc-edge and load any authenticated screen.

**`INTERNAL_SERVICE_SECRET` — 10 services**

1. One edit in `.env`, same as above.
2. Full restart. **Do not roll service-by-service.**
3. Verify with a **money path**, not `/health` — place and fill a small order, or run `pnpm order-path-smoke`. A green fleet proves nothing here.
4. If `INTERNAL_SERVICE_BODY_BIND=require` is set anywhere, confirm it is set everywhere first; that flag and this secret fail identically (401) and will be confused for each other.

**`JWT_ACCESS_SECRET` — 4 services**

1. One edit in `.env`.
2. Restart svc-identity, svc-edge, svc-ledger, svc-ws **together**.
3. **Every existing session is invalidated by design.** Users must log in again — this is correct, not a defect, and is the whole reason the four move together.
4. Verify: a fresh login works, and `/private/stream` on svc-ws accepts the new token.

**Per-service secrets** have a blast radius of exactly one service and can be rotated independently — that is the entire benefit of them being per-service, and it is worth preserving. `PAY_*_WEBHOOK_SECRET` additionally requires updating the value held by the sender at the same time, or deliveries begin failing signature verification.

### 2.4 · The category that hides: required, but never supplied

The most important line in this map is not about a value at all. It is about **schema/compose drift**: a service declares a secret as required, its compose block never passes it, and nothing says so.

What makes this class dangerous is that it is silent in **two different ways**, and the two look nothing alike:

| Silence                          | Mechanism                                                                                                                        | Instance                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **The container keeps its past** | A running container keeps the environment it started with. The fleet is healthy and stays healthy until something recreates it.  | **#431 · svc-ledger.** Crash-looped on `JWT_ACCESS_SECRET: Required` when a recreate reached it. |
| **The container never existed**  | The process dies at import, so the container is never created — and there is no restart loop for anyone to read. Nothing to see. | **#442 · svc-academy.** Nobody had logs to look at, because nothing ever ran.                    |

The second is the nastier one and is not intuitive: **a service that fails to boot is loud; a service nobody started is silent.** That framing is PR #442's, established by running the shipped image with the secret withheld — not mine, and it corrects what I had assumed from reading alone.

**A rotation is a mass container recreate.** Which is to say: a rotation is precisely the event that converts every latent binding gap in the fleet into a simultaneous crash-loop, at the worst possible moment, while the operator is already looking at something else — and will reasonably blame the new value.

So this is now a gate, not a warning: **`tooling/ci/compose-secret-parity.mjs`**, in the DoD gate. It compares what every `services/*/src/env.ts` requires against what that service's `docker-compose.apps.yml` block actually supplies, and fails the build on a gap.

**Proven retroactively:** run against the commit _before_ #431, it reports `svc-ledger — declares but is never given: JWT_ACCESS_SECRET` and emits the same one-line fix that was actually applied. Run against `main` today, it independently reports svc-academy — the defect #442 fixes (§4.3).

---

## 3 · `secret-scan` — before, after, and the mutation score

### 3.1 · What it covered before

Config files only: `.properties`, `.yml`, `.yaml`, `.env*`, `.conf`, `.cfg`, `.ini`, `.toml`, `.json`, plus `Dockerfile` and the compose files by name. Two rules — a credential-shaped **key** assigned a literal, and a URL embedding `user:password@host`.

The header said a secret in a `.java`/`.ts` file was "a different (rarer) problem". **That was the gap, and it was not rare.** A1.4 swept ~40 credentials out of the vendored tree and looked exhaustive because it swept `.properties` — the file type the scanner could see.

**Baseline on this tree, unmodified scan: `92 credential-shaped assignments across 122 config files`, 0 source files.**

### 3.2 · What it covers now

Config rules unchanged. Added:

| Check                       | Scope                            | Finds                                                                                     |
| --------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| `inline-url-credential`     | all source, **including tests**  | `user:pass@host` in a string literal — the ACT node credential                            |
| `source-credential-literal` | all source **except** test files | a credential-named identifier assigned a string literal — the captcha key pair            |
| `wallet-signing-literal`    | `01_wallet_rpc` only             | a literal passed positionally into a `sendFrom`/`transfer`/`withdraw` call — the ECT seed |
| `secret-by-convention`      | config                           | keys that carry key material despite a harmless name — `coin.withdraw-wallet`             |
| prefixed assignments        | Dockerfile, `.sh`                | `ENV KEY=…` and `export KEY=…`, which the key/value regex could not see                   |

Extensions added: 18 source types. **After: `112 credential-shaped assignments across 139 config files and 1,846 source files`.**

Three calibration decisions, each measured rather than guessed:

- **The identifier check skips test files.** `const SECRET = 'a-bank-mount-test-edge-secret-long-enough'` is a fixture — it _has_ to be credential-shaped or the test tests nothing. That pattern is **29 of 33** identifier hits repo-wide, one per mount test. The URL check still runs on tests, because a test can disclose something real by naming a real host, and one does.
- **Bare `token` is excluded** from the source rule though it is included for config keys. In config, a key named `token` is a credential; in source it is the JWT plumbing of half the codebase.
- **`send(` is excluded** from the wallet rule — `kafkaTemplate.send("topic", …)`. With it, three hits; without it, one, and the one is genuine.

### 3.3 · The known-disclosed register

Widening a gate over a vendored tree you cannot compile surfaces findings whose fix is an **owner rotation**, not a code edit. Both obvious answers are wrong: exempting the path hides it permanently, and failing the build gets the gate deleted within a week.

So `KNOWN_DISCLOSED` in `secret-scan.mjs` lists seven findings by file, line and check. They print **loudly on every single run**, green or red, with their owner-action id. They do not fail the build. **Anything not registered fails.**

The register cannot rot: **an entry that no longer describes a real finding is itself a build failure.** That rule earned its place immediately — the first draft registered `01_wallet_rpc/usdt/…/JsonrpcClient.java:163` as a disclosure, and the staleness check rejected it. Re-reading showed its password is identical to its username against `127.0.0.1` — the matched dev pair this repo already treats as a non-disclosure. **The register caught my own false finding before it reached the owner action list.**

### 3.4 · Mutation score

`tooling/ci/secret-scan.mutation.mjs`, wired into the DoD gate (~3s). A scanner that passes is indistinguishable from a scanner that is switched off; `process.exit(0)` on line 1 prints the same green tick. A1.4 proved the gate by hand once with a probe file that was then deleted — this makes it repeatable.

Twenty-eight synthetic mutants, each written into a throwaway git repo. **No mutant contains a realistic credential**; every planted value is the literal string `MUTANT-` plus filler.

```
detection       13/13 planted defects caught   (100.0%)
false positives  0/15 correct files rejected   (100.0% clean)
documented gaps  1 excluded from the score
```

**The second number is the one that matters.** A gate that cries wolf gets disabled, so fifteen mutants are correct-but-credential-shaped code — `${VAR:?msg}`, the matched dev pair, an i18n bundle, a test fixture, a Redis key prefix named `RESET_PASSWORD_CODE_PREFIX`, the `UTC--` keystore filename, an `ENV NODE_ENV=production`. Rejecting any of them is a failure.

Two mutants were **survivors on the first run** and are now caught: `ENV API_KEY=…` in a Dockerfile and `export API_KEY=…` in a shell script. Both are `key=value` wearing a prefix; the fix was one `replace`, and it cost zero new hits on the real tree.

**One documented gap remains open, by design:** a high-entropy value under an innocent key name (`coin.node-identifier=a3f9…`). Catching it needs entropy heuristics, which fire on minified bundles, lockfile hashes, git SHAs and base64 images. The scan's own header rejects them, that judgement stands, and the gap is printed on every verbose run rather than quietly scored as a pass.

---

## 4 · New findings

### 4.1 · A third-party captcha key **pair** hard-coded in a running, published jar

**`vendor/coinexchange/00_framework/ucenter-api/src/main/java/com/bizzan/bitrade/controller/RegisterController.java:101–103`**

Three `private static final String` constants — a captcha id and a **secret key pair** — constructed directly into a `final` verifier field on line 105. There is no `@Value`, no environment indirection, and no override: these are the credentials the service uses at runtime.

`ucenter-api` is the jar A1.4 confirmed is **packaged, running, and published on `0.0.0.0:6001`**.

**This was not in the A1.4 sweep**, and the reason is structural rather than careless: that audit read `.properties` files, which is where the other ~40 credentials lived, and the scanner backing it could not read `.java` at all. It is the same class as the `geetest.privateKey` item already on the rotation list — but in source, where nothing was looking.

Value not reproduced here. Registered as `OWNER-2`.

### 4.2 · A second copy of an already-flagged secret, in source

**`vendor/coinexchange/00_framework/ucenter-api/src/main/java/com/bizzan/bitrade/system/GeetestLib.java:49, 54`**

Field-initialiser copies of the geetest captcha id and private key. `GeetestConfig` constructs the bean from `${geetest.captchaId}` / `${geetest.privateKey}`, so these defaults are unreachable in the Spring path.

Listed anyway, because the failure mode is specific: **rotating the environment variable does not remove this copy.** An owner who rotates `GEETEST_PRIVATE_KEY` and moves on will reasonably believe the old value is gone from the tree. It is not. Registered as `OWNER-3`.

A third, lower-severity instance of the same shape: a hard-coded base32 TOTP seed at **`…/core/src/main/java/com/bizzan/bitrade/util/GoogleAuthenticatorUtil.java:25`**, in a class both `admin` and `ucenter-api` depend on. Referenced nowhere — an upstream demo constant. Registered as `OWNER-6` so "dead" is a recorded judgement rather than an omission.

### 4.3 · svc-academy — found independently, **already fixed by PR #442, not duplicated here**

**Not a disclosure — an availability defect, and the same class as #431.**

`services/svc-academy/src/env.ts:26` merges `internalServiceEnvSchema`, because the service calls svc-token's `/internal/stake/:userId` and svc-identity's `/internal/rank/:userId/perks`. `INTERNAL_SERVICE_SECRET` is therefore required with no default. Its `docker-compose.apps.yml` block on `main` supplies only `*edge-secret`.

Reproduced against the real schema with exactly the environment compose passes:

```
REFUSES TO BOOT ->
Invalid environment for svc-academy:
  - INTERNAL_SERVICE_SECRET: Required
```

**This is already fixed on `fix/academy-actually-starts` (PR #442, open).** I found it by writing the parity check, then found the PR — in that order. Their verification is better than what I could produce here: they ran the shipped image with the secret withheld, and probed `createRoom` through svc-edge to see a **403 on the rank perk** rather than a fail-closed 401, which is what actually proves svc-identity answered `/internal/rank/…` over the shared secret. Those two outcomes look identical from outside and mean opposite things.

**So this branch does not touch `docker-compose.apps.yml` at all.** Making the same one-line edit would duplicate their work and hand the reviewer a merge conflict on a file that PR already changes — the thing `pnpm claim:check` warns about. Instead the gap is listed in `FIXED_IN_OPEN_PR` in the parity check: reported loudly on every run, not failing, and **the entry becomes a build failure the moment #442 merges** — verified by running the check against their branch — so it cannot be left behind.

The lasting contribution here is not the one-line fix; it is that the class is now gated.

---

## 5 · Owner action list

Nothing below has been done. Each item names what to rotate, where it is set, what to restart, and how to know it worked. **Order matters:** OWNER-1 first because it can move value.

### OWNER-1 — the two ECT withdrawal secrets · **highest severity**

**Precondition, and it is a hard one:** [`docs/adr/2026-08-02-adopt-vendored-product-keep-our-ledger.md`](adr/2026-08-02-adopt-vendored-product-keep-our-ledger.md) §62 — _"A security review is a precondition of adoption, not a follow-up."_ Whether `01_wallet_rpc` ever runs against real value is an open owner decision (§94). **Do not deploy this service to rotate these secrets. Rotate them because they are disclosed, and keep the service off until the review is done.**

Two distinct secrets, both permanently disclosed in git history:

1. **`vendor/coinexchange/01_wallet_rpc/ect/src/main/resources/application.properties:14`** — key `coin.withdraw-wallet`. The withdrawal signing seed. `WalletController:47` reads it straight into `EctApi.sendFrom`, which POSTs it as a JSON field named `secret` to `coin.rpc` **over plain HTTP**. The key name is why no gate saw it: in the ETH family the same key holds a harmless keystore filename.
2. **`vendor/coinexchange/01_wallet_rpc/ect/src/main/java/com/bizzan/bc/wallet/component/EctApi.java:152`** — a **second** seed, hard-coded in a `main()` that signs a real transfer to a hard-coded counterparty account, against the hard-coded third-party IP on line 17, over plain HTTP.

**Do:**

1. Treat **both** as compromised. Move any value they control to freshly generated addresses. Rotating a seed does not recover a key that has been public in a repository — **the destination must change, not just the credential.**
2. Delete the `main()` at `EctApi.java:150–155`. It is a scratch harness that signs real transfers and has no reason to ship. (Not done here: the module **cannot be compiled from this tree** — its `pom.xml` lists an untracked `xrp` module, A1.4 §1 — so an edit to a withdrawal path could not be verified.)
3. Move `coin.withdraw-wallet` to `${ECT_WITHDRAW_WALLET_SECRET}` with **no default**, matching the pattern A1.4 applied to 22 other files, and document it in `.env.example`.
4. `coin.rpc` is plain HTTP and the seed is in the request body. **Either terminate TLS in front of it or do not run it.**

**Restart:** nothing — the service is not running and should not be started until the security review.
**Verify:** the old addresses hold no value; `pnpm scan:secrets` no longer lists `OWNER-1` (after step 3 the register entries must be deleted, or the staleness rule fails the build — which is the intended forcing function).

### OWNER-2 — NetEase captcha key pair · **new, §4.1**

**Where:** `…/ucenter-api/…/controller/RegisterController.java:101–103`.
**Do:** rotate the pair with the provider. Then move all three constants to `@Value` injection with no defaults — this needs constructor injection or `@PostConstruct`, because a `@Value` field is populated _after_ the `final verifier` initialiser on line 105 runs.
**Restart:** rebuild and redeploy `ucenter-api`. **Note the A1.4 deployment consequence:** the running jars predate the `${VAR}` conversion, so on rebuild every converted property must have its variable set first, or the service refuses to start. Set the environment before the rebuild, not after.
**Verify:** registration and login captcha still pass; `RegisterController` contains no string literal.

### OWNER-3 — geetest captcha private key · **second copy, §4.2**

**Where:** `${GEETEST_PRIVATE_KEY}` (already externalised), **plus** the stale literal at `…/ucenter-api/…/system/GeetestLib.java:49, 54`.
**Do:** rotate with the provider, set the new value in the environment, **and delete the field initialisers** so the old value stops shipping in the artefact.
**Restart:** rebuild and redeploy `ucenter-api`.
**Verify:** captcha still validates; `GeetestLib` holds no literal.

### OWNER-4 — ACT node credential

**Where:** `vendor/coinexchange/01_wallet_rpc/act/src/test/java/ActClientTest.java:10` — inside a URL, against a third-party public IP.
**Do:** rotate the credential on the node if it is ours; if the node is not ours, there is nothing to rotate and the file should simply lose the literal. Take it from `args` or the environment.
**Restart:** none — test-only, module does not compile.
**Verify:** the register entry is removed and `pnpm scan:secrets` stays green.

### OWNER-5 — the A1.4 list, unchanged and still outstanding

Restated because these are still live and this document should be the single place an owner looks. Full evidence in A1.4 §2:

1. **Spring Boot actuator password** (`ucenter-api`, `otc-api` → `security.user.password`, now `${COINEX_ACTUATOR_PASSWORD}`). **Disclosed permanently regardless of any fix** — the old value guarded `/monitor/heapdump` on a published port and a heap dump contains every other secret the process held. Rotating it is necessary and **not sufficient**: everything that was in those heaps should be considered exposed. Rotate first, then work outwards.
2. Cloud access key pairs (`aliyun.accessKeyId` / `accessKeySecret`) — someone else's bill.
3. SMS gateway passwords — billable.
4. `water.proof.app.secret.key` — second captcha secret.
5. Bytom access token (`01_wallet_rpc/btm` → `client.access.token`) — correctly formatted, treat as genuinely disclosed.

**Restart for 1–4:** rebuild and redeploy the affected `00_framework` services, environment set first.
**Verify:** `GET :6001/uc/monitor/env` with the **old** credential returns 401.

### OWNER-6 — dead 2FA demo constant

**Where:** `…/core/…/util/GoogleAuthenticatorUtil.java:25`. Referenced nowhere. Delete the constant. No rotation, no restart — recorded so the judgement is explicit.

### OWNER-7 — drop the weak default on the exchange session store

**Where:** `COINEX_REDIS_PASSWORD:-coinex_dev_only` in the vendored exchange compose file. A1.4 P3.
**Do:** change `:-` to `:?`. This is §1's dangerous-default case guarding session material on `0.0.0.0:6381`, and stealing a session is stealing an account.
**Restart:** the exchange Redis and its consumers. **This will refuse to start until the variable is set — that is the intended behaviour.**

### OWNER-8 — platform secrets, if any rotation is wanted

No disclosure is known for `EDGE_PRINCIPAL_SECRET`, `INTERNAL_SERVICE_SECRET` or `JWT_ACCESS_SECRET`. The values in `.env.example` are self-declaring `dev-only-*` placeholders, never valid in staging or prod. **If a real deployment has ever run on a `dev-only-*` value, treat all three as disclosed** and follow §2.3 exactly. `openssl rand -base64 48`, as `.env.example` already says.

---

## 6 · What changed on this branch, and what I deliberately did not touch

**Changed**

- `tooling/ci/secret-scan.mjs` — source scanning, three new checks, the known-disclosed register, `/*` comment handling, self-declaring placeholder values.
- `tooling/ci/secret-scan.mutation.mjs` — new; 28 mutants; in the DoD gate.
- `tooling/ci/compose-secret-parity.mjs` — new; in the DoD gate.
- `tooling/ci/dod-gate.mjs`, `package.json` — wiring only.
- This document.

**Nothing under `services/`, `packages/` or `apps/` is touched.** The diff is four tooling files, `package.json` and this document.

**Deliberately not touched**

- **No secret rotated, generated or invented.** No value committed, including as a placeholder.
- **No vendored Java source or properties edited.** `01_wallet_rpc` does not compile from this tree, and `ucenter-api` is under the ADR security-review precondition. Editing a withdrawal path I cannot build, or the construction order of a running controller I cannot test, trades a permanent disclosure I cannot undo for a fresh risk I cannot measure. **Removing a literal from HEAD does not un-disclose it** — only the owner's rotation does. Registered instead, and permanently visible on every scan run.
- **`docker-compose.apps.yml` — not touched.** The svc-academy one-liner belongs to PR #442 (§4.3). Two open PRs already edit this file; a third making a redundant edit is a merge conflict, not a contribution.
- **No refusal-to-boot weakened.** Both new gates make boot failure _more_ reliable, never less. The `SECRET_SCAN_NO_REGISTER` flag can only make `secret-scan` stricter — setting it turns a build red, never green, so it cannot decay into a bypass.

## 7 · What I did not verify

- **Whether any listed credential is still live with its provider.** Using a credential to test it is using it. Rotation is cheap; treat all of them as disclosed.
- **Any deployment other than this checkout.** A1.4's host observations are cited, not re-run — no fleet was running here.
- **That `01_wallet_rpc` compiles once `xrp` is resolved.** Its guards remain verified by reading, not by running.
- **Git history depth.** I established what is disclosed in the _current tree_. Nothing here reads back through history for values that were removed earlier and are still in the objects.
