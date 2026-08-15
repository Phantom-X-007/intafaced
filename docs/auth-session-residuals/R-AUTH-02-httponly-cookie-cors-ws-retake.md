# R-AUTH-02 — httpOnly refresh cookie requires CORS + WS Origin re-take

**Mountain:** D26-P3-06 residual (auth interaction) · **Depends on:** **D26-P3-07** origin contract — **do not rewrite CORS in this ticket**  
**Named socket today:** `services/svc-edge/README.md` §13 refresh-token in httpOnly cookie · `services/svc-edge/src/cors.ts` credentials paragraph · `services/svc-ws` private upgrade (no Origin check)

## Failure mode

Someone ships `Set-Cookie` for the refresh token (the socket `providers.tsx` already names) **without** re-taking two decisions that are only safe because **there is no cookie today**:

1. **CORS.** Edge never emits `Access-Control-Allow-Credentials`. A cookie makes every browser request credentialed. A credentialed response may never carry `Allow-Origin: *`. The allowlist must be the **production origin contract from P3-07**, not localhost leftovers, not a wildcard.
2. **Private WebSocket.** `/private/stream` authenticates `?access_token=` / `Authorization` and performs **no Origin check**. Correct today: a foreign page cannot cause the browser to send a memory-held Bearer. **Wrong the day a cookie exists:** browsers attach cookies on the upgrade regardless of Origin; there is no CORS preflight on WebSocket. Result: a malicious page on an allowed-looking origin (or any origin, if Origin is unchecked) rides the victim’s session into private positions.

CSRF on cookie-authenticated tRPC is the HTTP twin of the same miss.

## What this ticket is not

- Not a rewrite of `cors.ts` allowlist parsing, preflight-as-oracle, or `/admin/*` exclusion. Those are P3-07 + existing edge law.
- Not a Vue cookie implementation (HUMAN `nitro-frontend-all`).
- Not “add credentials: true” as a drive-by.

## Done-bar for a future PR (after P3-07 doc exists)

Single change set that, **together**:

- documents the cookie name, `Secure` / `HttpOnly` / `SameSite` (product pick; default `Strict` unless a written reason), path, and TTL ≤ refresh TTL;
- turns on CORS credentials **only** for P3-07’s staging/prod origins;
- adds an Origin allowlist on `svc-ws` private upgrade **before** the cookie is set anywhere;
- has a test that a disallowed Origin with a cookie does **not** upgrade.

If any of those four is missing, do not land the cookie.
