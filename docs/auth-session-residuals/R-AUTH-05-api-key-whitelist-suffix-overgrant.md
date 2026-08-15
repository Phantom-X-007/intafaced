# R-AUTH-05 — API-key domain whitelist suffix over-grant

**Mountain:** D26-P3-06 residual · **Not CORS:** this is `apiKeys.exchange` only. CORS stays P3-07.  
**File:** `services/svc-identity/src/auth/api-key-origin.ts` (`apiKeyOriginAllowed`)

## Failure mode

Non-empty `domain_whitelist` is fail-closed on missing Origin (good). Match is:

- exact hostname, or
- `host.endsWith('.' + allowed)`

That is the usual “example.com allows www.example.com” shape. It also means:

- Whitelist entry `com` allows `anything.com`.
- Entry `co` allows `evil.co` and also `not.co` if such a host appears.
- Entry `amazonaws.com` allows every customer bucket host under that suffix (maybe intended; maybe not).
- A caller who puts a full URL in the list is normalised to hostname (good). A caller who puts `*.example.com` is **not** treated as a wildcard — `normalizeOriginHost('*.example.com')` yields hostname `*.example.com` or fails URL parse; either way it does not mean “all subdomains” unless it happens to suffix-match. Operators will think glob works.

Empty list = unrestricted. That is the bot path and is honest. The failure is the **false sense of browser lock** when the list is a public suffix or a too-short label.

Stolen key + attacker Origin that suffix-matches → `exchange` succeeds → JWT for the key’s scopes (not withdraw, but trade/pay merchant as granted).

## Done-bar for a future PR

Refuse whitelist entries that are public suffixes or fewer than two labels (policy: no `com`, no `co.uk` as a whole unless explicitly opted). Document that `*` globs are invalid. Tests: `com` denied; `example.com` allows `www.example.com` and denies `example.com.evil.test` / `notexample.com`. Do not fold this into `cors.ts`.
