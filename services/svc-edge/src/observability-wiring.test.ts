import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMITTED_LABEL_NAMES, metricNamesIn } from '@intafaced/telemetry';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { METRICS_PATH, markAuthOutcome, registerMetrics } from './metrics.js';

/**
 * DOES ANYTHING ACTUALLY SCRAPE IT, AND DOES THE PANEL NAME WHAT WE EMIT?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * `metrics.test.ts` proves the endpoint is mounted and its output parses. That
 * is necessary and it is not sufficient. An observability change has three
 * joints, and all three fail SILENTLY:
 *
 *   1. a `/metrics` route nobody scrapes,
 *   2. a scrape target pointing at a host or port nothing listens on,
 *   3. a dashboard whose PromQL names a series that does not exist.
 *
 * Every one of those looks complete in a diff and reports nothing. The third is
 * the nastiest: a panel querying `http_request_duration_seconds` while the
 * service emits `intafaced_http_request_duration_seconds` is a green build, a
 * green test suite, and a blank chart forever. Nothing in a normal suite sees
 * it, because nothing in a normal suite reads the dashboard.
 *
 * So this file reads THE REAL CONFIG FILES from the repo and cross-checks them
 * against THE REAL OUTPUT of the real endpoint. It never compares a config
 * against a constant retyped from that config.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT CANNOT DO
 *
 * It cannot start Grafana, and it does not pretend to. It proves the dashboard
 * JSON parses, that its datasource uid is one the provisioning actually defines,
 * that its provider is declared, that the provider's directory is mounted, and
 * that every metric it queries exists in a live scrape. Whether Grafana renders
 * it was verified out of band by standing the container up; that transcript is
 * in the PR, and it is not something a vitest run can re-prove.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

/**
 * Pull one top-level block out of a YAML document by its key, textually.
 *
 * Deliberately NOT a general YAML parser. `docker-compose.apps.yml` uses
 * anchors and merge keys (`<<: *app`), and a hand-rolled parser that mishandled
 * those would be a new source of wrong answers in the very test whose job is to
 * detect wrong answers. Block extraction plus a targeted read is narrow enough
 * to be obviously correct and is exactly as sensitive to the drift that matters:
 * change the port and this fails.
 *
 * The whole file is also validated by the real thing — `promtool check config`
 * for `prometheus.yaml`, `docker compose config` for the compose files — out of
 * band. This checks the values; those check the grammar.
 */
function blockAt(text: string, indent: number, key: string): string {
  const pad = ' '.repeat(indent);
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `${pad}${key}:` || l.startsWith(`${pad}${key}: `));
  if (start < 0) throw new Error(`no block "${key}" at indent ${indent}`);

  const out = [lines[start] as string];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    // A non-blank line at or left of the key's indent ends the block.
    if (line.trim() !== '' && !line.startsWith(`${pad} `) && !line.startsWith(`${pad}\t`)) break;
    out.push(line);
  }
  return out.join('\n');
}

/** One entry of a `scrape_configs:` list, found by its `job_name`. */
function scrapeJob(prometheusYaml: string, jobName: string): string {
  const lines = prometheusYaml.split(/\r?\n/);
  const starts = lines.reduce<number[]>((acc, l, i) => (l.trim() === `- job_name: ${jobName}` ? [...acc, i] : acc), []);

  // Exactly one. Two jobs with the same name is a config Prometheus rejects, and
  // a second one added by a later change is precisely the drift to catch.
  expect(starts).toHaveLength(1);
  const start = starts[0] as number;

  const out = [lines[start] as string];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (/^\s*- /.test(line) && !/^\s{6,}- /.test(line)) break;
    if (line.trim() !== '' && !/^\s{4}/.test(line)) break;
    out.push(line);
  }
  return out.join('\n');
}

/** A live scrape of the real endpoint, through the real route. */
async function liveScrape(): Promise<string> {
  const app = Fastify({ logger: false });
  registerMetrics(app, { service: 'svc-edge' });
  app.all('/api/trade/*', async (req) => {
    markAuthOutcome(req, 'authenticated');
    return { ok: true };
  });
  await app.ready();

  // Real traffic first, so the payload contains SAMPLES and not just `# TYPE`
  // headers. A dashboard cross-check against an empty exposition would pass
  // while the series it needs were never emitted.
  await app.inject({ method: 'POST', url: '/api/trade/orders', payload: {} });
  await app.inject({ method: 'GET', url: '/api/nope' });

  const res = await app.inject({ method: 'GET', url: METRICS_PATH });
  await app.close();
  expect(res.statusCode).toBe(200);
  return res.body;
}

// ── PromQL metric-name extraction ───────────────────────────────────────────

/**
 * Functions, aggregators and keywords that are identifiers but not metrics.
 * Anything an expression names that is NOT in here must be a series the endpoint
 * emits — which is what makes the assertion meaningful rather than decorative.
 */
const PROMQL_IDENTIFIERS = new Set([
  'sum',
  'rate',
  'irate',
  'increase',
  'avg',
  'min',
  'max',
  'count',
  'count_values',
  'stddev',
  'stdvar',
  'topk',
  'bottomk',
  'quantile',
  'histogram_quantile',
  'clamp',
  'clamp_min',
  'clamp_max',
  'round',
  'abs',
  'ceil',
  'floor',
  'exp',
  'ln',
  'log2',
  'log10',
  'sqrt',
  'delta',
  'idelta',
  'deriv',
  'predict_linear',
  'absent',
  'absent_over_time',
  'changes',
  'resets',
  'label_replace',
  'label_join',
  'time',
  'timestamp',
  'vector',
  'scalar',
  'sort',
  'sort_desc',
  'group',
  'last_over_time',
  'avg_over_time',
  'sum_over_time',
  'min_over_time',
  'max_over_time',
  'count_over_time',
  'quantile_over_time',
  'stddev_over_time',
  'by',
  'without',
  'on',
  'ignoring',
  'group_left',
  'group_right',
  'offset',
  'bool',
  'and',
  'or',
  'unless',
]);

/**
 * Every metric family an expression references.
 *
 * Label matchers and `by (...)` / `without (...)` groups are removed FIRST, so
 * the label names inside them are never mistaken for series. What is left is
 * function calls and metric names, and the set above separates those.
 */
function metricsIn(expr: string): ReadonlySet<string> {
  const stripped = expr
    // Label matcher blocks, including the `$service` variable inside them.
    .replace(/\{[^}]*\}/g, ' ')
    // Grouping clauses.
    .replace(/\b(?:by|without|on|ignoring|group_left|group_right)\s*\([^)]*\)/g, ' ')
    // Range and offset durations, so `5m` is not read as an identifier.
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/"[^"]*"/g, ' ');

  const found = new Set<string>();
  for (const m of stripped.matchAll(/[a-zA-Z_:][a-zA-Z0-9_:]*/g)) {
    const id = m[0];
    if (!PROMQL_IDENTIFIERS.has(id)) found.add(id);
  }
  return found;
}

interface Panel {
  readonly id?: number;
  readonly title?: string;
  readonly type?: string;
  readonly datasource?: { readonly uid?: string };
  readonly targets?: readonly { readonly expr?: string; readonly datasource?: { readonly uid?: string } }[];
}

interface Dashboard {
  readonly uid?: string;
  readonly title?: string;
  readonly panels?: readonly Panel[];
  readonly templating?: { readonly list?: readonly { readonly query?: unknown; readonly definition?: string }[] };
}

const DASHBOARD_REL = 'tooling/infra/grafana/dashboards/edge-slo.json';
const dashboard = (): Dashboard => JSON.parse(read(DASHBOARD_REL)) as Dashboard;

// ─────────────────────────────────────────────────────────────────────────────

describe('the scrape config reaches the endpoint this service actually serves', () => {
  const job = () => scrapeJob(read('tooling/infra/prometheus.yaml'), 'svc-edge');

  it('targets the compose service name, not localhost and not a host port', () => {
    const targets = /targets:\s*\[([^\]]*)\]/.exec(job());
    expect(targets).not.toBeNull();

    const hosts = (targets?.[1] ?? '').split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, ''));
    expect(hosts).toEqual(['svc-edge:4000']);

    // `localhost` inside the Prometheus container is the Prometheus container.
    // This is the single most common way an application scrape target is wrong.
    expect(hosts.join()).not.toContain('localhost');
    expect(hosts.join()).not.toContain('127.0.0.1');
  });

  it('names the port svc-edge is actually configured to listen on', () => {
    const composeEdge = blockAt(read('docker-compose.apps.yml'), 2, 'svc-edge');
    const httpPort = /HTTP_PORT:\s*'?(\d+)'?/.exec(composeEdge)?.[1];

    // Read from the compose file, not typed in here. If someone moves svc-edge
    // to another port and forgets the scrape config, this is what goes red.
    expect(httpPort).toBeDefined();

    const target = /targets:\s*\[\s*['"]([^'"]+)['"]/.exec(job())?.[1];
    const [host, port] = (target ?? '').split(':');

    expect(port).toBe(httpPort);
    // The scrape host must be the compose SERVICE KEY, which is the name Docker
    // resolves on the project network.
    expect(host).toBe('svc-edge');
    expect(read('docker-compose.apps.yml')).toContain(`\n  ${host}:\n`);
  });

  it('scrapes the path the service registers, character for character', () => {
    const metricsPath = /metrics_path:\s*(\S+)/.exec(job())?.[1];
    // `METRICS_PATH` is the constant the route is mounted from, so this compares
    // the config against the code rather than against another copy of itself.
    expect(metricsPath).toBe(METRICS_PATH);
  });

  it('sits on the same compose network as prometheus', () => {
    // Prometheus is defined in docker-compose.yml; svc-edge in the apps file,
    // which `include:`s it. Without that include they are separate projects and
    // the service name would not resolve.
    expect(read('docker-compose.apps.yml')).toMatch(/include:\s*\n\s*-\s*docker-compose\.yml/);
    expect(read('docker-compose.yml')).toContain('prom/prometheus');
  });

  it('adds no label the exposition already owns', () => {
    const block = job();
    // A `labels:` block setting a name the payload also sets does not overwrite
    // it — Prometheus keeps both and renames the scraped one to
    // `exported_<name>`, so every dashboard query matching on it silently
    // matches nothing.
    for (const name of EMITTED_LABEL_NAMES) {
      expect(block).not.toMatch(new RegExp(`^\\s+${name}:`, 'm'));
    }
  });

  it('scrapes well inside the rate limiter per-client budget', () => {
    const interval = /scrape_interval:\s*(\d+)s/.exec(job())?.[1];
    expect(interval).toBeDefined();

    const perMinute = 60 / Number(interval);

    // MAX and WINDOW are owner-set (no git default 300 / 60000). Headroom vs
    // scrape is checked against an explicit owner example of 300 per 60s — the
    // magnitude they may set, not a schema default. `/metrics` is deliberately
    // NOT on the exempt list in hardening.ts, so the headroom is the thing
    // keeping scrapes out of the 429 path — and a gap in the SLO series appears
    // exactly when traffic is high, which is when it matters.
    const envSrc = read('services/svc-edge/src/env.ts');
    expect(envSrc).not.toMatch(/EDGE_RATE_LIMIT_MAX:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.default\(300\)/);
    expect(envSrc).not.toMatch(/EDGE_RATE_LIMIT_WINDOW_MS:[^\n]*?\.default\(/);

    const ownerExampleMax = 300;
    const ownerExampleWindowMs = 60_000;
    const budgetPerMinute = ownerExampleMax * (60_000 / ownerExampleWindowMs);
    expect(perMinute).toBeLessThan(budgetPerMinute / 10);
  });
});

describe('the dashboard is loadable, and queries series that exist', () => {
  it('is valid JSON with a uid and at least one panel', () => {
    const d = dashboard();
    expect(d.uid).toBeTruthy();
    expect(d.title).toBeTruthy();
    // §14.5 asks for "at least one SLO dashboard panel". Assert the floor the
    // law names, not the number that happens to be there today.
    expect((d.panels ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('every panel points at a datasource the provisioning actually defines', () => {
    const datasources = read('tooling/infra/grafana/provisioning/datasources/datasources.yaml');
    const declared = new Set([...datasources.matchAll(/^\s*uid:\s*(\S+)/gm)].map((m) => m[1] as string));

    // A panel referencing an undefined uid renders "Datasource not found" —
    // a broken panel that still counts as a committed dashboard in a diff.
    expect(declared.has('intafaced-prom')).toBe(true);

    for (const panel of dashboard().panels ?? []) {
      expect(declared).toContain(panel.datasource?.uid);
      for (const target of panel.targets ?? []) {
        expect(declared).toContain(target.datasource?.uid);
      }
    }
  });

  it('names only metrics present in a live scrape of the real endpoint', async () => {
    const emitted = metricNamesIn(await liveScrape());
    // Guard the guard: an empty payload would make every assertion below vacuous.
    expect(emitted.size).toBeGreaterThan(0);

    const referenced = new Set<string>();
    for (const panel of dashboard().panels ?? []) {
      for (const target of panel.targets ?? []) {
        if (!target.expr) continue;
        for (const metric of metricsIn(target.expr)) referenced.add(metric);
      }
    }

    // If this ever trips, the panel is querying something the code does not
    // emit — a green diff and a blank chart. That is the whole reason this file
    // parses the OUTPUT instead of reading the source.
    expect(referenced.size).toBeGreaterThan(0);
    for (const metric of referenced) {
      expect([...emitted]).toContain(metric);
    }
  });

  it('its template variable reads a label from a metric that exists', async () => {
    const emitted = metricNamesIn(await liveScrape());
    const definitions = (dashboard().templating?.list ?? []).map((v) => v.definition ?? '');

    for (const def of definitions) {
      const inner = /label_values\(\s*([a-zA-Z_:][a-zA-Z0-9_:]*)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/.exec(def);
      expect(inner).not.toBeNull();
      // Both halves: the metric must exist AND the label must be one we emit.
      expect([...emitted]).toContain(inner?.[1]);
      expect([...EMITTED_LABEL_NAMES]).toContain(inner?.[2]);
    }
  });

  it('every panel query survives label-matcher stripping with a metric left over', () => {
    // A panel whose expr yields no metric name would pass the check above
    // vacuously — `for (const metric of empty)` asserts nothing.
    for (const panel of dashboard().panels ?? []) {
      for (const target of panel.targets ?? []) {
        if (!target.expr) continue;
        expect(metricsIn(target.expr).size, `panel ${panel.id} "${panel.title}"`).toBeGreaterThan(0);
      }
    }
  });
});

describe('Grafana can find the dashboard at all', () => {
  const PROVIDER_REL = 'tooling/infra/grafana/provisioning/dashboards/dashboards.yaml';

  it('declares a file provider — without one the directory is just files on a disk', () => {
    const provider = read(PROVIDER_REL);
    expect(provider).toMatch(/^\s*-\s*name:/m);
    expect(provider).toMatch(/type:\s*file/);
  });

  it('the provider path is mounted, and it is mounted from the directory the JSON lives in', () => {
    const containerPath = /path:\s*(\S+)/.exec(read(PROVIDER_REL))?.[1];
    expect(containerPath).toBeTruthy();

    const grafana = blockAt(read('docker-compose.yml'), 2, 'grafana');
    const mount = [...grafana.matchAll(/-\s*\.\/(\S+?):(\S+?)(?::ro)?$/gm)].find((m) => m[2] === containerPath);

    // THE JOINT THAT WAS MISSING BEFORE THIS CHANGE. `provisioning/` was
    // mounted; a `dashboards/` directory was not, and no provider existed. A
    // provider whose path is not mounted finds an empty directory and Grafana
    // starts with no dashboards and no error.
    expect(mount, `no compose mount onto ${containerPath}`).toBeDefined();

    // And the host side must be the directory the committed JSON is actually in.
    expect(DASHBOARD_REL.startsWith(`${mount?.[1]}/`)).toBe(true);
  });

  it('the datasource provisioning is mounted too', () => {
    const grafana = blockAt(read('docker-compose.yml'), 2, 'grafana');
    expect(grafana).toContain('./tooling/infra/grafana/provisioning:/etc/grafana/provisioning');
  });
});
