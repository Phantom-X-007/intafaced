# svc-edge — the front door (§9)

Turns a bearer token into the signed principal every mounted service requires, and refuses to carry anything else a caller tried to smuggle in.

## Why it exists

`packages/contracts/src/edge.ts` verifies a signature over the principal header. **Nothing in the platform produced that signature.** The result, found by audit: every `scopedProcedure` in the OS refused every caller, because svc-identity issued a JWT that opened no door.

This service is the join between those two halves. It is the only place in the system that turns proof of identity into authority.

## API contract

| Route         | Purpose                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `GET /health` | liveness                                                                                          |
| `GET /ready`  | readiness + the route table, so an operator can see what will be forwarded without reading source |
| `ALL /api/*`  | the proxy                                                                                         |

### The route table

| Prefix           | Upstream      | Env var         |
| ---------------- | ------------- | --------------- |
| `/api/identity`  | svc-identity  | `IDENTITY_URL`  |
| `/api/trade`     | svc-trade     | `TRADE_URL`     |
| `/api/token`     | svc-token     | `TOKEN_URL`     |
| `/api/agents`    | svc-agents    | `AGENTS_URL`    |
| `/api/bank`      | svc-bank      | `BANK_URL`      |
| `/api/p2p`       | svc-p2p       | `P2P_URL`       |
| `/api/pay`       | svc-pay       | `PAY_URL`       |
| `/api/blueprint` | svc-blueprint | `BLUEPRINT_URL` |
| `/api/protocol`  | svc-protocol  | `PROTOCOL_URL`  |

**`svc-ledger` and `svc-matching` are deliberately absent.** Both serve service-to-service HTTP behind a shared secret (#50, #55). No browser has business reaching either — `ledger.post` moves value on a module's own authority, which is exactly why no user token carries `ledger:write`. There is a test asserting they never appear in the table.

An unlisted prefix returns **404, never a pass-through**. An edge that forwards what it does not recognise is a proxy for the entire internal network.

## The security properties, and why each is shaped that way

**Reserved headers are stripped, not overwritten.** Anything under `x-intafaced-` is the edge's vocabulary, not the caller's. They are removed unconditionally _before_ any decision about whether to set our own. The difference matters on every path where we decide not to — an anonymous request, a failed verification, an expired token. Overwriting only protects the success case, which was never the one at risk.

**Region is resolved server-side.** It drives the jurisdiction matrix — which modules a caller may reach at all. A client that could set its own region would select its own regulator. Defaults to `XX`, the region the matrix treats as unknown, so a misconfigured deployment is restrictive rather than permissive.

**The bearer token is never forwarded upstream.** A service that can read a token is a service that can replay it.

**A bad token lands as anonymous, never as an error.** A forged or expired token on a public endpoint is an ordinary event. The request reaches the service unauthenticated and `protectedProcedure` refuses it there with the right status — which is what lets a caller with an expired token still reach `auth.refresh` and recover.

**The edge holds no database, no bus, and no `INTERNAL_SERVICE_SECRET`.** The internet-facing component should have the smallest blast radius in the fleet, and that is a property of what it is allowed to hold. Giving it the service secret would let a compromised edge call `ledger.post` directly rather than merely proxying to something that can.

## Events

**None.** This service publishes and consumes nothing. It owns no data.

## Ledger recipes used

**None.** No value moves through the edge. It is a request-shaping component; the money paths live behind it.

## Kill-switch

`edge.gateway` in `FLAG_REGISTRY`. Turning it off returns 503 from the proxy while leaving `/health` and `/ready` answering, so an operator can take the public surface down without losing the ability to see whether the process is alive.

## Configuration

| Variable                | Notes                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_ACCESS_SECRET`     | **must match svc-identity's.** A mismatch means every login succeeds and every request after it is anonymous — which presents as "logged in but nothing works". |
| `EDGE_PRINCIPAL_SECRET` | must match every mounted service's                                                                                                                              |
| `DEFAULT_REGION`        | two-letter code; `XX` = unknown/restricted                                                                                                                      |
| `UPSTREAM_TIMEOUT_MS`   | a hung service must not hold an edge connection open                                                                                                            |

## Not built yet

- **Rate limiting.** There is none, anywhere in the platform. The edge is the right place for it and it is not here.
- **Geo-IP region resolution.** `DEFAULT_REGION` is a single configured value; per-request resolution replaces one line in `index.ts`.
- **Request size limits** and **CORS.** Neither is configured.
- **Streaming responses.** The proxy buffers with `response.text()`, so this is not a path for websockets or large downloads.
