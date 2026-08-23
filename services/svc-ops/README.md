# svc-ops

Thin operator surfaces for CRM, team directory, warehouse revenue, and projects. **Not** a second money book, **not** payroll, **not** SaaS.

Blank analytics replica refuses `ops.warehouse_unwired`. Empty warehouse is empty — never a fabricated `$0`. Team has no compensation field; `inventPayroll` refuses `ops.payroll_invent_forbidden`. Contacts are a local list plus named identity/support source lag.

Module id: `ops`. Edge prefix: `/api/ops`. Port: `4022`.

## API

| Procedure                           | Scope                    | Notes                                                                                   |
| ----------------------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `health`                            | public                   | `{ ok, service, custodial: false }`                                                     |
| `contacts`                          | `ops:read`               | local + sourced; identity/support may be `ops.identity_unwired` / `ops.support_unwired` |
| `createContact`                     | `ops:write`              | local CRM row                                                                           |
| `team`                              | `ops:read`               | directory; `payroll.forbidden` always                                                   |
| `createTeamMember`                  | `ops:write`              | handle + role only; salary keys → `ops.payroll_invent_forbidden`                        |
| `inventPayroll`                     | `ops:write`              | always refuses                                                                          |
| `revenue`                           | `ops:read`               | warehouse cubes or named lag/unwired refuse; amounts as strings                         |
| `projects.list` / `projects.create` | `ops:read` / `ops:write` | thin list                                                                               |

## Ledger

None. Revenue reads `queryWarehouseSurface` from `@intafaced/contracts` (ops.analytics). No recipes. No `post`.
