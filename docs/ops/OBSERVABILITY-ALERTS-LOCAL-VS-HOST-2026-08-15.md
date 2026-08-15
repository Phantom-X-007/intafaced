# Observability alerts — local compose vs a real Prometheus host

**Tracker:** D26-P3-08 · **Class N** (this file + rule wiring) · **Class X leftover:** a Prometheus that is not the laptop compose process.

`infra.slo-dashboards` already landed `/metrics` + scrape + `edge-slo.json`. This mountain names **alert routes** and keeps the dashboard **honest**. It does **not** mark metrics tracker rows done, and it does not claim a production SLO.

## Named alert routes (in-repo)

File: `tooling/infra/prometheus/alerts/edge-fail-closed.yaml`  
Loaded by: `rule_files` in `tooling/infra/prometheus.yaml`  
Mounted by: `docker-compose.yml` → `/etc/prometheus/alerts`

| Alert name                         | Route label                 | Fires when                                      | Invents traffic? |
| ---------------------------------- | --------------------------- | ----------------------------------------------- | ---------------- |
| `IntafacedEdgeScrapeFailClosed`    | `intafaced-edge-scrape`     | `up{job="svc-edge"}` is 0 **or absent**         | No               |
| `IntafacedEdgeHttpSeriesAbsent`    | `intafaced-edge-metrics`    | `intafaced_http_requests_total` is absent       | No               |

There is **no Alertmanager** in compose. Firing means the Prometheus UI (`http://localhost:9090/alerts` on a laptop) can show the route. It does not page anyone.

## What is local-only

| Piece                                         | Where it lives                         | What it proves                                      |
| --------------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| Prometheus process                            | `docker-compose.yml` service `prometheus` | Laptop scrape of compose DNS `svc-edge:4000`     |
| Grafana + `edge-slo.json`                     | same compose + `tooling/infra/grafana/` | Panels query names the edge emits; empty ≠ green    |
| Alert **evaluation**                          | same Prometheus, `rule_files`           | Rules load; fail-closed on missing scrape / series |
| `prom/prometheus:v3.0.1` image pin            | compose                                 | Local binary, not a hosted service                  |

Local compose **cannot** see a production edge, cannot retain months of series, and cannot deliver pages. A green local dashboard is not a proven prod SLO. Do not paste invented p99 numbers as if they were.

## What needs a real Prometheus host (Class X)

A human (Nitro + whoever owns prod infra) must decide and provision:

1. **A Prometheus (or compatible) host** that is not the compose container — durable disk, not `promdata` on a laptop.
2. **Scrape targets** that resolve in that environment (not `svc-edge:4000` on the compose network unless that name is real there).
3. **Alertmanager (or equivalent) routes** that page a human — the `route:` labels above are names only until a receiver exists.
4. **Who is on-call** and which severity (`page` vs `warning`) is allowed to wake them.

Until that host exists, D26-P3-08 is **named routes + honest local dashboard**, not “observability in production.”

## Dashboard honesty (Grafana)

`tooling/infra/grafana/dashboards/edge-slo.json`:

- Availability is a **ratio of existing series**, not `clamp_min(..., 0.0001)` (that fabricated a denominator when nothing was scraped).
- The SLO stat uses `last` (not `lastNotNull`) so a dead scrape cannot freeze the last green sample.
- Empty / null / NaN display as **NO SERIES**, not a green 99.9%.
- §20 99.9% / 2s numbers on the panel are **engineering SLO targets**, not proven production measurements.

## Tracker honesty

Do **not** flip `infra.slo-dashboards` or other metrics rows. This PR does not add per-service `/metrics`, does not stand a remote scrape host, and does not prove prod availability.
