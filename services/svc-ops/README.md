# svc-ops

Thin operator surfaces for CRM, team directory, warehouse revenue, projects, and custody tiers. **Not** a second money book, **not** payroll, **not** SaaS, **not** a key store.

Blank analytics replica refuses `ops.warehouse_unwired`. Empty warehouse is empty — never a fabricated `$0`. Team has no compensation field; `inventPayroll` refuses `ops.payroll_invent_forbidden`. Contacts are a local list plus named identity/support source lag.

GET `/ready` reports `IDENTITY_URL` / `SUPPORT_URL` as configured or absent — never a live probe. Set is `ops.identity_unprobed` / `ops.support_unprobed`. Blank stays `ops.identity_unwired` / `ops.support_unwired`.

Module id: `core-ops`. Edge prefix: `/api/ops`. Port: `4022`.

## API

| Procedure                           | Scope                    | Notes                                                                                                                     |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `health`                            | public                   | `{ ok, service, custodial: false }`                                                                                       |
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
