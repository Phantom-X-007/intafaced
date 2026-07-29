/**
 * PROMETHEUS METRICS — the numbers behind the §14.5 SLO panel.
 *
 * ── Why this exists at all, and why it is hand-written ──────────────────────
 *
 * The compose stack has run an OTel collector, Tempo, Prometheus and Grafana
 * for a while. Nothing was feeding any of them. Every service imports
 * `@opentelemetry/api` and calls `trace.getTracer(...)`, and `@opentelemetry/api`
 * with no SDK registered returns a NO-OP tracer: the spans are created,
 * discarded, and never exported. Verified against the running fleet —
 * `GET :3200/api/search` returns `{"traces":[]}`, and `:9090` holds no series
 * whose name does not start with `go_` or `prometheus_`.
 *
 * So there was no metric on which an SLO panel could be built. This is the
 * smallest thing that changes that: a counter and a histogram over what the
 * edge already measures, in the Prometheus text exposition format, scraped
 * directly. Reasons for not reaching for the OTel metrics SDK instead:
 *
 *   · Every service in the fleet would need the SDK bootstrapped for the OTLP
 *     path to carry anything, and most of them belong to other streams.
 *   · A scrape target is debuggable with `curl`. An OTLP push that silently
 *     drops is the failure this file exists because of.
 *   · No new dependency. `svc-edge` ships four runtime dependencies and the
 *     component with the largest attack surface in the fleet is the wrong place
 *     to add a transitive tree for a histogram.
 *
 * ── Why the edge is the right place to measure an SLO ───────────────────────
 *
 * §20 sets the targets ("beat-the-leader targets — engineering SLOs, not
 * slogans"). An SLO is a promise to a USER, so it is measured where the user
 * is: the front door, including every hop behind it. `svc-trade` timing its own
 * handler cannot see the queue in front of it, and would report health during
 * exactly the incident an SLO exists to catch.
 *
 * ── Not exposed publicly ────────────────────────────────────────────────────
 *
 * `/metrics` carries no user data — labels are route names, upstream names and
 * status classes, never ids or amounts — but it is still an internal surface.
 * The ingress in front of the edge must not route `/metrics`, the same way it
 * must not route `/admin/*`. That is a deployment property this file cannot
 * enforce; `README.md` states it, and there is no ingress config in the repo
 * yet to state it in.
 */

/**
 * Histogram buckets, in seconds.
 *
 * Chosen around the numbers §20 actually names — sub-second perp finality, a
 * card auth decision under 2s — rather than the library default, so the
 * interesting quantiles land between buckets that exist. A p99 that can only be
 * reported as "somewhere between 0.5s and 5s" is not an SLO.
 */
export const DURATION_BUCKETS: readonly number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export interface RequestLabels {
  /** Module the request was routed to, e.g. `trade`. */
  readonly module: string;
  /**
   * The tRPC procedure, e.g. `orders.create` — or `_other` for anything that is
   * not a tRPC call.
   *
   * BOUNDED ON PURPOSE. A label whose values come from a URL is how a metrics
   * store gets a cardinality explosion; procedure names come from a router, so
   * the set is finite and known. Anything unrecognised collapses to `_other`.
   */
  readonly procedure: string;
  /** `2xx` | `4xx` | `5xx` — the class, not the code. */
  readonly status: string;
  /** `authenticated` | `anonymous` | `refused` — how the caller presented. */
  readonly auth: string;
}

interface Series {
  readonly labels: RequestLabels;
  count: number;
  sum: number;
  readonly buckets: number[];
}

function labelKey(l: RequestLabels): string {
  return `${l.module}\u0000${l.procedure}\u0000${l.status}\u0000${l.auth}`;
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function renderLabels(l: RequestLabels, extra?: Record<string, string>): string {
  const pairs = [
    `module="${escapeLabelValue(l.module)}"`,
    `procedure="${escapeLabelValue(l.procedure)}"`,
    `status="${escapeLabelValue(l.status)}"`,
    `auth="${escapeLabelValue(l.auth)}"`,
    ...Object.entries(extra ?? {}).map(([k, v]) => `${k}="${escapeLabelValue(v)}"`),
  ];
  return `{${pairs.join(',')}}`;
}

export function statusClass(status: number): string {
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  return '2xx';
}

/**
 * A single-process registry.
 *
 * Prometheus scrapes each replica separately and aggregates with `sum by (...)`,
 * so per-process counters are the correct shape — a shared store would produce
 * one series that no `rate()` could interpret across restarts.
 */
export class EdgeMetrics {
  private readonly series = new Map<string, Series>();

  constructor(private readonly maxSeries = 2_000) {}

  observe(labels: RequestLabels, durationSeconds: number): void {
    let key = labelKey(labels);

    // CARDINALITY IS A DENIAL-OF-SERVICE SURFACE, and this endpoint is behind
    // the public door. `procedure` is derived from a path an attacker controls,
    // so a thousand requests to `/api/trade/trpc/aaa…` would otherwise be a
    // thousand permanent series in Prometheus. Past the cap, everything new
    // collapses into one `_overflow` series — the dashboard degrades, the
    // metrics store does not.
    if (!this.series.has(key) && this.series.size >= this.maxSeries) {
      labels = { ...labels, procedure: '_overflow' };
      key = labelKey(labels);
    }

    let s = this.series.get(key);
    if (!s) {
      s = { labels, count: 0, sum: 0, buckets: new Array<number>(DURATION_BUCKETS.length).fill(0) };
      this.series.set(key, s);
    }
    s.count += 1;
    s.sum += durationSeconds;
    for (let i = 0; i < DURATION_BUCKETS.length; i += 1) {
      if (durationSeconds <= (DURATION_BUCKETS[i] as number)) s.buckets[i] = (s.buckets[i] as number) + 1;
    }
  }

  /** Prometheus text exposition format (0.0.4). */
  render(): string {
    const lines: string[] = [
      '# HELP intafaced_edge_requests_total Requests proxied by svc-edge, by module, procedure, status class and auth outcome.',
      '# TYPE intafaced_edge_requests_total counter',
    ];

    for (const s of this.series.values()) {
      lines.push(`intafaced_edge_requests_total${renderLabels(s.labels)} ${s.count}`);
    }

    lines.push(
      '# HELP intafaced_edge_request_duration_seconds End-to-end latency as the caller experiences it, measured at the front door.',
      '# TYPE intafaced_edge_request_duration_seconds histogram',
    );

    for (const s of this.series.values()) {
      for (let i = 0; i < DURATION_BUCKETS.length; i += 1) {
        lines.push(
          `intafaced_edge_request_duration_seconds_bucket${renderLabels(s.labels, { le: String(DURATION_BUCKETS[i]) })} ${s.buckets[i]}`,
        );
      }
      lines.push(`intafaced_edge_request_duration_seconds_bucket${renderLabels(s.labels, { le: '+Inf' })} ${s.count}`);
      lines.push(`intafaced_edge_request_duration_seconds_sum${renderLabels(s.labels)} ${s.sum}`);
      lines.push(`intafaced_edge_request_duration_seconds_count${renderLabels(s.labels)} ${s.count}`);
    }

    return `${lines.join('\n')}\n`;
  }
}
