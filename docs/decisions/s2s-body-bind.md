# Decision: S2S body binding (L2-6) — how it ships without an outage

**Status:** **Mechanism landed, `accept-both` by default. The flip to `require` is a separate operator action.**
**Date:** 2026-07-30 · **Author:** Denon spine (Stream B) · **Board:** D12 · **Audit finding:** L2-6

---

## The hole

The service-to-service HMAC signed `` `${service}\n${timestamp}` `` and **not the request
body**. Within the 300-second skew window a captured signature was replayable against
**any body on any procedure of that service**.

That is not abstract. The S2S surfaces include the ones that move value:

| Surface                                   | Reached how                   | What a replay buys                                     |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| `svc-ledger` `/trpc/post`                 | `registerS2sHttp`, plain JSON | `ledger.post()` directly — any transaction, any amount |
| `svc-matching` `POST /markets/:id/orders` | `verifyServiceHeaders` guard  | an order the ledger never held funds for               |
| `svc-matching` `DELETE …/orders/:orderId` | same                          | cancel any resting order, releasing that user's hold   |

The original header comment was candid about the deferral and its reason — Fastify has
parsed and discarded the raw bytes by the time a handler or tRPC context runs. That
deferral was reasonable. It was also a replayable money instruction.

## What now happens

Two schemes, and exactly two.

|                | v1 (legacy)                | v2                                                                   |
| -------------- | -------------------------- | -------------------------------------------------------------------- |
| preimage       | `${service}\n${timestamp}` | `intafaced-s2s-v2\n` + length-prefixed `(service, ts, sha256(body))` |
| headers        | 3                          | 4 — adds `x-intafaced-service-body`                                  |
| body integrity | **none**                   | yes                                                                  |
| replay window  | 300s                       | 300s (unchanged)                                                     |

**The digest header's presence is the version marker.** No fourth "version" header
exists; one whose only content restates another header's presence is a thing to keep
in sync for no gain.

### Length-prefixing, and why not another newline

v1 used a newline so `('ab', 1)` and `('a', 11)` could not collide. With three fields
that reasoning thins out: `service` is entirely caller-controlled and may contain a
newline, so a bare `\n` join is injective only because of validation living elsewhere
— the timestamp must parse as an integer, the digest must be 64 hex characters. That
is an invariant held at a distance. One relaxed validator, or one added field, and the
framing silently stops being unambiguous.

So each field is `<byteLength>:<value>\n`. Injective on its own terms, whatever a field
contains. **Byte** length, not character length, so a multi-byte service name cannot
shift the frame. There is a test asserting distinct preimages across adversarial names
including embedded delimiters, a fake length prefix, and the precomposed-versus-combining
forms of `café` (which render identically and are 5 versus 6 bytes).

The `intafaced-s2s-v2` domain tag makes v1 and v2 preimages **disjoint by construction**.
That is what makes `accept-both` a migration window rather than a second hole: a captured
v1 signature can never be reinterpreted as v2, or the reverse. Both directions are tested.

### The digest covers bytes, not an object

`sha256` of the raw wire bytes, never of a re-serialised object — JSON key order and
whitespace are not canonical, so digesting `JSON.stringify(req.body)` would commit to a
different byte sequence than the one that arrived. Same rule `signPrincipalHeader`
already follows in `edge.ts`.

A caller with no body signs the digest of the **empty** body rather than omitting the
header. "There is no body" becomes a signed statement, so a body cannot be bolted onto
a bodyless call — which is a real route: `svc-matching`'s cancel is a `DELETE`.

## The mechanism, measured rather than assumed

Fastify 5.10.0, probed directly before any of this was written:

- `addContentTypeParser('application/json', { parseAs: 'buffer' }, …)` **overrides the
  built-in JSON parser with no prior `removeContentTypeParser`.** Worth checking —
  Fastify throws `FST_ERR_CTP_ALREADY_PRESENT` for duplicates in other cases, and the
  safe-looking remove-then-add would itself throw once anything else had replaced the
  parser.
- `parseAs: 'buffer'` hands over the wire bytes **verbatim** — key order, runs of
  whitespace, and multi-byte characters all survive.
- A `; charset=utf-8` parameter still routes to the `application/json` parser, so a
  caller adding one does not slip past.
- A bodyless request (`GET`, or `POST` with no content-type) **never invokes a
  content-type parser**, while an `onRequest` hook always runs.

That last asymmetry is why retention is modelled as three states, not two:

| state                            | meaning                       | under `require`                      |
| -------------------------------- | ----------------------------- | ------------------------------------ |
| `{ retained: true, bytes: <n> }` | the request carried a body    | verify the digest                    |
| `{ retained: true, bytes: <0> }` | no body, **and we know that** | verify against the empty digest      |
| `{ retained: false }`            | nobody kept the bytes         | **fail closed** — `body-unavailable` |

Collapsing the last two into `Buffer \| undefined` would let a service that forgot to
install retention accept every body while believing it had verified them.

Replacing the JSON parser means owning its error cases, so `FST_ERR_CTP_EMPTY_JSON_BODY`
and `FST_ERR_CTP_INVALID_JSON_BODY` are reproduced — status **and** code. A silent
400→500 change on the money path would be a poor trade for a security fix.

---

## The migration — this is the part that decides deployability

### It is incrementally deployable. No coordinated restart is required.

Two properties make that true:

1. **The default is `accept-both`.** A verifier running the new code accepts a v1
   caller running the old code. Nothing 401s at any point during the rollout.
2. **A v2 caller is safe to deploy before its verifier.** `accept-both` is also the
   default on the _old_ code path in the sense that matters: an old verifier ignores
   the unknown `x-intafaced-service-body` header entirely and validates the v1
   preimage — but a v2 caller signs the **v2** preimage, which an old verifier would
   reject.

**So caller and verifier ordering does matter, and only in one direction:** for any
pair, **the verifier must be running the new code before the caller starts sending v2.**

The safe order is therefore:

```
1. Deploy VERIFIERS first  (svc-ledger, svc-matching)  → accept-both, accepts v1 and v2
2. Deploy CALLERS second   (the ledger-clients)         → start signing v2
3. Watch the v1 warning go quiet
4. Flip verifiers to require
```

Because this PR changes verifiers and callers together, **step 1 and 2 collapse into one
rollout, and the order within it is the risk.** Deploying a v2 caller while its verifier
still runs old code produces 401s on that caller's money path.

> **Operator note, and this is the one thing to get right:** roll **svc-ledger and
> svc-matching before** svc-agents, svc-p2p and svc-token. If the deploy tooling cannot
> order them, deploy svc-ledger and svc-matching alone first, confirm health, then the
> rest. There is no version of this that breaks quietly — a wrong order is immediate,
> loud 401s on the affected caller, and the fix is to finish rolling the verifier.

### Rollback

`require` → `accept-both`. That cannot 401 anybody.

There is deliberately **no** `off` mode. It would look like a rollback lever and behave
like an outage: once callers sign v2 preimages, a verifier that refuses to read the
digest rejects every one of them.

### How an operator knows it is safe to flip to `require`

`svc-ledger` and `svc-matching` log a **warning on every accepted v1 call**, naming the
calling service:

```
s2s caller did not bind its request body (L2-6) — its signature is replayable;
redeploy it before setting INTERNAL_SERVICE_BODY_BIND=require
  { callingService: "svc-trade", scheme: "v1", bodyBind: "accept-both" }
```

**The signal is silence.** When that warning has not appeared for a full skew window
(300s) — realistically, over a period covering every caller's duty cycle including cron
paths like `svc-bank`'s standing orders and `svc-token`'s epoch mint — every caller is on
v2 and `INTERNAL_SERVICE_BODY_BIND=require` is safe.

Flip per service. `svc-ledger` and `svc-matching` are independent.

### Callers still on v1 after this PR — the honest gap

This PR upgrades the three ledger-clients in Stream B's territory. **Three callers are
owned by other agents and are still v1:**

| Caller      | File                                                   | Calls            |
| ----------- | ------------------------------------------------------ | ---------------- |
| `svc-trade` | `services/svc-trade/src/ledger-client.ts`              | svc-ledger       |
| `svc-trade` | `services/svc-trade/src/spot/matching-client.ts`       | **svc-matching** |
| `svc-pay`   | `services/svc-pay/src/ledger-client.ts`                | svc-ledger       |
| `svc-bank`  | `services/svc-bank/src/ledger-client.ts` (two clients) | svc-ledger       |

Upgraded here: `svc-agents`, `svc-p2p`, `svc-token`.

The change is mechanical and identical in each — swap `serviceAuthHeaders(svc, secret)`
for `serviceAuthHeadersForBody(svc, secret, payload)` and serialise the body **once** so
the bytes that are signed are the bytes that are sent. `serviceAuthHeadersForBody` takes
`body` as a **required positional** precisely so a caller cannot pass an accidentally
`undefined` payload and get a silently downgraded v1 signature that type-checks and tests
green.

**`svc-matching` cannot be flipped to `require` until `svc-trade`'s matching-client is
upgraded** — it is the only caller. Same for `svc-ledger` and the three above.

### Residual risk while in `accept-both`, stated plainly

**`accept-both` buys a migration with no outage. It does not buy body integrity.**

A verifier in `accept-both` still accepts v1, so a captured **v1** call remains replayable
against any body for 300 seconds — exactly the hole L2-6 names. Domain separation means an
attacker cannot _downgrade_ a captured v2 call by stripping the digest header (tested),
but that does not help a caller that never sent one.

**The security property exists only under `require`.** Until every caller is v2 and both
money-path verifiers are flipped, L2-6 is mitigated for three of six callers and open for
the rest. That is a real improvement and it is not the fix. The fix is the flip.

---

## Deliberately not in this change

- **Per-service keypairs.** Every service shares one secret, so any service can mint any
  other service's signature. Body binding does not help with that and neither does v2
  framing — it is a key-distribution and rotation problem, with a different design and a
  different blast radius. Bundling it here would mean doing both badly. **Own PR.**
- **Binding the method and path.** Body binding stops "any body"; it stops "any procedure"
  only narrowly, since two procedures can accept structurally similar bodies. (The
  route-crossing tests here pass because the _bodies_ differ, not because the path is
  bound.) Binding the request target is the completion and is cheap in code — but it
  breaks the fleet the first time anything between two services rewrites a path, so it
  needs a survey of the proxy and mount topology first. The length-prefixed framing exists
  so that adding a fourth field later is a clean `v3` and not a collision risk.

## Config

`INTERNAL_SERVICE_BODY_BIND` on `internalServiceEnvSchema`, so every S2S service picks it
up: `accept-both` (default) | `require`.
