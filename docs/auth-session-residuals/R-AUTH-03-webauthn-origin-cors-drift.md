# R-AUTH-03 — WebAuthn origin list vs Edge CORS origin list

**Mountain:** D26-P3-06 residual · **CORS contract owner:** **D26-P3-07** (cite, do not duplicate the origin table here)  
**Files:** `services/svc-identity/src/env.ts` (`WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_ID`) · `services/svc-identity/src/auth/webauthn.ts` · `EDGE_ALLOWED_ORIGINS` in `services/svc-edge/src/cors.ts`

## Failure mode

Two independent allowlists answer “is this browser origin ours?”

| List                   | Used for                                           |
| ---------------------- | -------------------------------------------------- |
| `EDGE_ALLOWED_ORIGINS` | Browser tRPC/REST preflight and ACAO echo          |
| `WEBAUTHN_ORIGIN`      | `clientDataJSON.origin` on register/assert/step-up |

They can diverge.

- **CORS closed, WebAuthn open:** a page that cannot call the API can still complete a passkey ceremony against identity if it can reach the service another way (direct port, leaked compose, mis-proxied path). Unlikely on a correct nginx, real on a leaked identity port.
- **WebAuthn closed, CORS open:** users on the real product origin cannot enrol or step-up with passkeys. Looks like “WebAuthn broken.” Operators “fix” it by widening `WEBAUTHN_ORIGIN` to `*` equivalent (comma-list of everything) without matching P3-07.
- **Defaults:** WebAuthn origin defaults to `http://localhost:3000`; RP ID defaults to `localhost`. CORS **refuses** those defaults on `APP_ENV=staging|prod` (`CORS_ENFORCED_ENVS`). Staging that copies `.env.example` gets passkeys bound to localhost while the browser origin is the hosted shell — silent enrol failure or, if identity is also exposed, a wrong-RP credential.

## What this ticket is not

P3-07 writes the **production origin contract** (which hosts, which envs). This ticket is the **auth consumer**: WebAuthn must **subscribe** to that contract, not keep a second invented list.

Do not invent hostnames in a craft PR. Do not set production RP ID here (Class X / deploy).

## Done-bar for a future PR

P3-07 doc names `WEBAUTHN_ORIGIN` / `WEBAUTHN_RP_ID` as required to match the edge allowlist (or a documented subset). A gate or boot check fails closed when `APP_ENV` is staging/prod and the WebAuthn origin is not a subset of `EDGE_ALLOWED_ORIGINS`. No `localhost` RP ID in those envs.
