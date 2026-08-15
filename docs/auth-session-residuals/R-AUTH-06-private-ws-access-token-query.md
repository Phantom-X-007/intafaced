# R-AUTH-06 — Private WebSocket access token in the query string

**Mountain:** D26-P3-06 residual · **Coupled to:** R-AUTH-02 (cookie) and P3-07 (CORS/WS Origin)  
**File:** `services/svc-ws/src/private/gateway.ts` (`tokenFrom` reads `?access_token=` first)

## Failure mode

Browsers cannot set `Authorization` on a WebSocket upgrade. The private stream therefore accepts the access JWT in the URL. Consequences:

- Reverse proxies, CDN, and `svc-ws` access logs record the full JWT (scopes, `sub`, `mfa`, step-up `trade:withdraw` if present).
- Intermediate `Referer` / browser history / crash dumps can hold it.
- Log shipping (P3-08 observability) becomes a credential leak unless query strings are stripped — they are not, today, as an auth guarantee.

This is the **deliberate** cost of “no cookie, no ambient credential, CORS credentials off.” It is not a bug in the parser. It **becomes** a combined incident if someone “fixes” logging by moving to cookies without R-AUTH-02.

## Done-bar for a future PR

Pick one and test it:

1. **Stay query-based:** document log-redaction requirement (edge/nginx/`svc-ws` must not persist `access_token=`). Add a failing test or gate if access logs are captured in-repo without redaction. Keep Origin unchecked (still safe).
2. **Subprotocol or first-message token** (non-cookie): upgrade unauthenticated, client sends Bearer in first WS frame, gateway authenticates or kills. No query string, still no cookie. Needs a client change (HUMAN Vue lane) — agents must not edit that tree; contract first.
3. **Cookie:** only with R-AUTH-02 + P3-07 complete.

Do not “just delete” `?access_token=` without a replacement; that takes private stream offline.
