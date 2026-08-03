# TRK-ops.notifications

**Title:** Event-driven fan-out: in-app, push, email, SMS  
**Tracker:** `ops.notifications` · phase 5 · plane F · status `ready` · owner none  
**Depends on:** `infra.events` (done) · **requires:** `services/svc-notify`  
**Sibling sockets:** `socket.notify-email` · `socket.notify-push` · `socket.notify-sms`  
**Tip freeze:** `origin/main` @ `c773dafa` (re-derive before implement)  
**Pack type:** research only — no implement; no fake delivery; no `features.mjs` edit.

## DoD (plain language)

Bus events become inbox rows; out-of-app channels (email / push / SMS) attempt
delivery only to **confirmed** addresses; each channel keeps **attempt** vs
**accepted** distinct forever (never “delivered” from a gateway 2xx alone).
Missing credentials produce recorded `channel.not_configured` refusals, not
silent success. In-app always works as honest fallback. Required channels
configured for a deployment make readiness fail if those gateways are down.

## Path on tip

| Area          | Location                                                          |
| ------------- | ----------------------------------------------------------------- |
| Service       | `services/svc-notify/` (port **4015**, schema `notify`)           |
| Channels      | `src/channels/` — adapter + email/push/SMS + real HTTP wire tests |
| Bus consumers | fillSettled, P2P escrow, kyc, rank, stake, bankMarginCalled, …    |
| Mount         | edge `/api/notify`                                                |
| Owner runbook | `docs/OWNER-ACTIONS-NOTIFY-GATEWAYS.md`                           |
| Copy          | Out-of-app via `@intafaced/i18n`                                  |

**Tip residual:** multi-channel fan-out **code exists**; real delivery needs
**owner-supplied gateway credentials**. Without them, out-of-app refuses with
`channel.not_configured`. In-app is live. Outcome column is `accepted_at`, not
`delivered_at` (migration 0002).

## Blocked by

| Blocker               | Notes                                                      |
| --------------------- | ---------------------------------------------------------- |
| Class X / ops secrets | ESP, push, SMS credentials — Nitro human / ops             |
| Optional product      | Alerts/watchlists = extension, not this mountain’s min DoD |

Not blocked by Shehzad. Not blocked by Denon for credential-wiring docs +
readiness. Code residual is small vs secrets residual.

## First PR size (if free)

**XS–S after secrets exist:** enable one real channel in a non-prod env, prove
one event → attempt → accepted (or honest refusal) with delivery rows; document
env vars already named by `notify.channels` / readiness. **Without secrets:**
docs/runbook only (Class N) or more bus event consumers — do not fake delivery.
Do not mark tracker `done` while all out-of-app channels refuse.
