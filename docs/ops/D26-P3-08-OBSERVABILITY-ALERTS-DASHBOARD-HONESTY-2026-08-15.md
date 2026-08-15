# D26-P3-08 — Observability: alerts + dashboard honesty

**Tracker:** Denon hard board `D26-P3-08` (Run).  
**Product tracker:** `infra.slo-dashboards` is **already `done`** (metrics half of doctrine §14.5, landed 2026-08-08). This note does **not** re-open that row and does **not** claim paging.  
**Lane:** `denon-d26-p3-08-observability`.  
**Leverage (Phase A IN):** existing Prometheus scrape + Grafana file provision. No new telemetry stack. No `svc-edge` edit (X6).  
**Date:** 2026-08-15. Tip SHA at write: re-derive `origin/main`.

---

## Verdict (one screen)

| Claim operators might want                                                        | Honest status                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge `/metrics` exists and is scrape-shaped                                       | **Real in repo.** Emitter is `packages/telemetry`. Edge serves it. Wiring tests in `svc-edge` (untouched here) cross-check scrape host/port/path and dashboard PromQL against live exposition. |
| One SLO dashboard as code                                                         | **Real as a committed Grafana JSON**, provisioned for **local compose Grafana** (`uid: intafaced-edge-slo`).                                                                                   |
| That dashboard beyond local compose (hosted Grafana / Grafana Cloud / prod fleet) | **Named-absent.** No hosted datasource, no cloud folder, no non-compose Grafana URL in this repo.                                                                                              |
| Alert routes that page a human                                                    | **None configured — refuse to claim paging.**                                                                                                                                                  |

Do **not** invent SLO numbers. Panel titles and Grafana thresholds in `edge-slo.json` copy doctrine display language (§14 / §20). They are **not** measured production SLOs. Historical laptop scrape figures in the `infra.slo-dashboards` tracker note are local-compose proof, not a fleet SLO.

---

## What is already real (repo + local compose)

These artefacts exist on tip. They become a **live picture** only while `docker compose` Grafana / Prometheus / Tempo / OTEL are running on a laptop (or any host that runs that same compose). They are not a production observability contract.

| Piece                | Where                                                                      | What it actually does                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP metric families | `packages/telemetry/src/metrics.ts`                                        | Emits `intafaced_http_requests_total` and `intafaced_http_request_duration_seconds` (histogram) with bounded labels: `service`, `module`, `method`, `status` (class), `outcome`. No `prom-client`. |
| Trace provider       | `packages/telemetry/src/start.ts`                                          | Registers a real `NodeTracerProvider` so existing spans can leave the process. Without this, OTLP env vars are a no-op.                                                                            |
| Edge scrape target   | `tooling/infra/prometheus.yaml` job `svc-edge`                             | Scrapes `svc-edge:4000/metrics` every 10s. Sibling jobs: `prometheus` (self), `nats` (`nats:8222`). **No other application scrape jobs.**                                                          |
| Prometheus process   | `docker-compose.yml` service `prometheus` (`prom/prometheus:v3.0.1`)       | Host port **9090**. Config bind-mount only. `external_labels`: `platform=intafaced`, `env=dev`.                                                                                                    |
| Grafana process      | `docker-compose.yml` service `grafana` (`grafana/grafana:11.4.0`)          | Host port **3001** → container 3000. Anonymous Admin enabled. Default admin `intafaced` / `intafaced`. Laptop credentials — not a production IdP.                                                  |
| Dashboard provider   | `tooling/infra/grafana/provisioning/dashboards/dashboards.yaml`            | File provider `intafaced`, folder INTAFACED, `allowUiUpdates: false`, path `/etc/grafana/dashboards`.                                                                                              |
| Datasources          | `tooling/infra/grafana/provisioning/datasources/datasources.yaml`          | Prometheus `uid: intafaced-prom` → `http://prometheus:9090`. Tempo `uid: intafaced-tempo` → `http://tempo:3200`.                                                                                   |
| The one dashboard    | `tooling/infra/grafana/dashboards/edge-slo.json`                           | Title **INTAFACED — Front Door SLO**. Five panels. Queries only the two families above. Datasource uid matches provision.                                                                          |
| Traces path          | `otel-collector` + `tempo` in compose; `tooling/infra/otel-collector.yaml` | OTLP 4317/4318 → Tempo. Collector `deployment.environment=dev`. Metrics pipeline remote-writes to local Prometheus. **Exporters point at compose service names, not a vendor SaaS.**               |

### Dashboard panels (existing series only)

No sixth panel added in this mountain: every PromQL in the JSON already names series `packages/telemetry` emits. Adding `up` or invented families would either fail `observability-wiring.test.ts` or fake a series.

| Panel                        | Queries                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| Availability — non-5xx share | `rate(intafaced_http_requests_total{…})` ratio                           |
| Latency p99 / p50 per module | `histogram_quantile` on `intafaced_http_request_duration_seconds_bucket` |
| Request rate by status class | `sum by (status) (rate(intafaced_http_requests_total…))`                 |
| Auth outcome                 | `sum by (outcome) (rate(intafaced_http_requests_total…))`                |
| Traffic by module            | `sum by (module) (rate(intafaced_http_requests_total…))`                 |

### Coverage the tracker already told the truth about

From `infra.slo-dashboards` (do not restate as a new discovery):

- **One of 19 services** emits Prometheus text: `svc-edge`.
- Modules appear as `module=` when traffic **crosses the edge**.
- `svc-ws`, `svc-ledger`, `svc-matching` are **not** behind the edge (`routes.ts` outside-the-door). No series for them from this dashboard.
- A module with no traffic has no series. Empty panel ≠ healthy module.

---

## What is still local-only

| Thing                                                        | Why it is not “beyond compose”                                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prometheus, Grafana, Tempo, OTEL collector                   | Declared only in `docker-compose.yml`. Published ports 9090 / 3001 / 3200 / 4317 / 4318.                                                            |
| `env: dev` / collector `deployment.environment=dev`          | Labels say laptop.                                                                                                                                  |
| Grafana anonymous Admin + default password                   | Unsafe for any shared host; compose convenience.                                                                                                    |
| Volumes `promdata` / `grafanadata` / `tempodata`             | Survive `compose down` until `-v`; they are not a backup/restore contract (that is P3-09, not this doc).                                            |
| Staging rsync of `tooling/infra/` (see staging threat-model) | Would copy the **same** local stack onto a staging host. That is still compose-shaped Grafana, still no paging, still not a named hosted dashboard. |
| Hosted Grafana / AMP / Mimir / Grafana Cloud                 | **No config, no org slug, no folder UID, no URL.**                                                                                                  |
| Per-service `/metrics` on the other 18 services              | Residual. Shared emitter exists; they have not adopted it. Do not rebuild telemetry to close that.                                                  |

“One real dashboard beyond local compose” is therefore **not met as a hosted object**. What is real is the **JSON + provider + scrape** that Grafana loads **when compose Grafana is up**.

---

## Named alert routes — none configured

Searched (this mountain): Prometheus config, Grafana provisioning tree, compose services, `tooling/infra/`.

| Named slot                                                         | Status                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Prometheus `alerting:` / `alertmanagers:`                          | **Absent** (`tooling/infra/prometheus.yaml` has scrape only).                                                             |
| Prometheus `rule_files`                                            | **Absent.** No recording rules, no alerting rules.                                                                        |
| Alertmanager service                                               | **Absent** from `docker-compose.yml`. No `alertmanager.yml`.                                                              |
| Grafana unified alerting contact points                            | **Absent.** Provisioning is datasources + dashboards only. No `contact-points`, no `notifiers`, no notification policies. |
| PagerDuty / Opsgenie / Slack / email / webhook paging destinations | **None named in-repo.**                                                                                                   |
| On-call rotation mapped to a route                                 | **None.**                                                                                                                 |

**Refuse to claim paging.** A red panel on localhost:3001 is not an alert route. `svc-notify` price alerts (`v22.alerts`) are a **user product** mountain, not ops paging.

Do not add mute Alertmanager YAML or Grafana “alert” JSON that destinations nobody. That would look like alerting and page no one.

---

## What this mountain does not do

- Does not rebuild `packages/telemetry`.
- Does not edit `services/svc-edge` (X6).
- Does not invent availability or latency SLO percentages for production.
- Does not close P3-07 CORS, P3-10 incident, P3-05 rotation, P2-04 fleet, or the kill-switch runbook.
- Does not flip `infra.slo-dashboards` (already done for the metrics/dashboard-as-code half).

---

## Residual (honest next, not this PR)

Closing “beyond local compose” + paging is **Class X / ops host work**: a non-compose Grafana (or equivalent) with a real org, scrape of a real edge, and **named** contact points that a human has agreed to receive. Until those exist in config, keep saying **none configured**.
