# svc-ops

Thin operator surfaces for CRM, team directory, warehouse revenue, projects, and custody tiers. **Not** a second money book, **not** payroll, **not** SaaS, **not** a key store.

Blank analytics replica refuses `ops.warehouse_unwired`. Empty warehouse is empty — never a fabricated `$0`. Team has no compensation field; `inventPayroll` refuses `ops.payroll_invent_forbidden`. Contacts are a local list plus named identity/support source lag.

GET `/ready` reports `IDENTITY_URL` / `SUPPORT_URL` as configured or absent — never a live probe. Set is `ops.identity_unprobed` / `ops.support_unprobed`. Blank stays `ops.identity_unwired` / `ops.support_unwired`. Identity/support sources stay `hardcoded-absent` even when the URL is set — this process does not construct a client. Process liveness is not a custody claim — `/ready` does not stamp `custodial: false`.

Module id: `core-ops`. Edge prefix: `/api/ops`. Port: `4022`.

## API

| Procedure                           | Scope                    | Notes                                                                                                                     |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `health`                            | public                   | `{ ok, service }` — liveness, not a custody claim                                                                         |
| `contacts`                          | `ops:read`               | local + sourced; identity/support may be `ops.identity_unwired` / `ops.support_unwired`                                   |
| `createContact`                     | `ops:write`              | local CRM row                                                                                                             |
| `team`                              | `ops:read`               | directory; `payroll.forbidden` always                                                                                     |
| `createTeamMember`                  | `ops:write`              | handle + role only; salary keys → `ops.payroll_invent_forbidden`                                                          |
| `inventPayroll`                     | `ops:write`              | always refuses                                                                                                            |
| `revenue`                           | `ops:read`               | warehouse cubes or named lag/unwired refuse; amounts as strings                                                           |
| `projects.list` / `projects.create` | `ops:read` / `ops:write` | thin list                                                                                                                 |
| `custody.list`                      | `ops:read`               | cold/warm/hot tiers; keys empty; wrap unset names `ops.custody_wrap_unset`; freeze blank names `ops.custody_freeze_unset` |
| `custody.createApproval`            | `ops:write`              | pending movement record when freeze is `open`; blank/frozen refuse and do not queue                                       |
| `custody.wrap`                      | `ops:write`              | blank wrap → `ops.custody_wrap_unset`; never invents keys                                                                 |
| `custody.execute`                   | `ops:write`              | freeze unset/frozen named refuse; wrap unset → `ops.custody_wrap_unset`; else `ops.custody_chain_unwired`                 |

## Ledger

None. Revenue reads `queryWarehouseSurface` from `@intafaced/contracts` (ops.analytics). No recipes. No `post`.

## Durable outreach CRM

`outreach.capture`, `outreach.resume` and `outreach.answer` are public **POST mutations**. The browser creates a canonical 256-bit continuation capability independently of its UUID request key. Keep the capability in protected client storage; never put it in a URL, telemetry, ordinary logs or an email lookup. This capability is the proof for continuation, including another device; email equality supplies no authority. PostgreSQL stores its SHA-256 hash. An expired or incorrect capability refuses before any replay is returned. Capture returns a submission receipt only after contacts, organisation relationships, opportunities, tasks, attributed activity, request dedupe and the acknowledgement outbox commit together.

New public captures create separate unverified CRM contacts even when email addresses match. They neither attach platform identities nor replace prior contacts or questionnaire answers. Selected audience answers are immutable; a retry must retain its request key and exact payload. New audience answers require the current submission revision. Investor indicative contributions remain decimal-string business records. Unknown source keys remain untrusted hints with unknown campaign and recipient linkage.

Private `outreach.listOpportunities`, `getOpportunity`, `owners`, `assign`, `changeStage`, `addNote` and `engagement` require `ops:read` or `ops:write` and a live founder authority check. Identity authenticates the original signed principal and verifies active identity, current unrevoked MFA session and enabled founder entitlement on every request, including retries. API keys, subaccounts, expired tokens and shared dashboard actors cannot authorize CRM access. Assignment and stage writes lock the opportunity and check its revision; all staff writes bind their dedupe result to the authenticated actor and canonical input. Notes are append-only and their sequence is allocated under the same lock. Lists use `(created_at,id)` keyset cursors and literal name/email search, with one batched lookup returning exactly the unique contacts associated with the visible page.

### Deployment inputs

1. Set `DATABASE_URL` to the ops role and publish positive integer `OPS_DATABASE_POOL_MAX`. Startup runs the ops-only migration under a transaction/advisory lock. Missing or unavailable storage refuses `ops.crm.storage_unconfigured`; it never reports a captured enquiry.
2. Set `OPS_OUTREACH_CONFIG` to JSON with `founders` (exactly two distinct verified founder UUIDs), `initialOwnerUserId` (one of them), `continuationTtlSeconds` (60–2592000), IANA `timeZone`, `businessWeekdays` (ISO 1–7), `reviewHour` and `reviewMinute`. No founder ID, UTC timezone or review deadline is invented. Initial review is at that clock on the next configured business day. A DST gap moves to the earliest valid following local clock on the same date; a fold selects the first occurrence. A completely missing civil date refuses instead of silently postponing review. Holidays are not modeled. Founder IDs are normalized to lowercase before duplicate and membership checks.
3. Set `IDENTITY_URL`, `INTERNAL_SERVICE_SECRET` and `EDGE_PRINCIPAL_SECRET` consistently with the authenticated identity service. Missing authority wiring refuses private access.
4. `pnpm --filter @intafaced/svc-ops db:migrate` applies the migration; append `down` to reverse it. Down drops CRM data. Export and restore a verified backup before invoking down on populated storage. The migration runner preserves its journal and serializes parallel deployments.
5. Set an isolated `TEST_DATABASE_URL` ending in `_test` for the PostgreSQL suite. The harness creates a separate database for each suite and tests restart persistence, replay privacy, concurrency, answer preservation, keyset pages and up/down/up reversal.

The public abuse limit is 30 requests per source IP per minute, counted durably even when capability checks fail. The process uses the socket peer IP and stores only a hash. Fastify proxy trust remains disabled. Behind the edge, publish its exact trusted CIDRs in `OPS_TRUSTED_PROXY_CIDRS`: only those socket peers may supply the edge-overwritten `x-intafaced-client-ip` header. IPv4, IPv6 and mapped IPv6 are validated and canonicalized. Untrusted headers and X-Forwarded-For supply no authority; missing configuration retains the safe shared-edge budget. Malformed CIDRs refuse startup and malformed headers from trusted peers refuse the request with a code that contains no address. Identity authority fetches reject redirects so signed principal and service credentials cannot be forwarded to another host. Fastify logs IDs and outcomes without questionnaire bodies or capabilities. Outbound emails remain disabled; therefore no outbound campaign or resend capability exists.

### Integration and data operation

The acknowledgement outbox is durable and explicitly `unconfigured`, with stable `acknowledgement:<submissionId>` business keys. Private detail includes outbox status and error code. No worker claims gateway acceptance or delivery. Notify integration must reuse its gateway's business-key idempotency or acceptance lookup; without either, an uncertain outcome must become `unresolved` and must not be blindly resent. Enquiry acknowledgements are separate from the contact's optional marketing permission.

Document analytics report `disabled/api_access_unavailable` for the current Free entitlement, never fabricated zero views. No document-provider API key is required. A verified entitled provider read/import, campaign mapping and delivery adapter remain separate live-integration work.

Questionnaire originals and attributed activities are retained with their submission. Notes are additive; no public delete, merge, contact lookup or export API exists. Before production, the owner must set retention periods, approved private export destinations and an authenticated deletion process that removes prospect data while preserving only legally required restricted operator history. Use encrypted backups with restricted access and prove a restore of contacts, submissions, activities and outbox before launch. This implementation does not assert that retention, email, document import, domains or backup operations have been deployed.
