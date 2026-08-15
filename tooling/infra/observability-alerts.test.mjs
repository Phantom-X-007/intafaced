#!/usr/bin/env node
/**
 * D26-P3-08 — the alert file is reachable, and the SLO dashboard cannot read
 * empty scrape as green. Does not start Prometheus. Does not invent traffic.
 *
 * Run: node tooling/infra/observability-alerts.test.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const problems = [];
const check = (cond, msg) => {
  if (!cond) problems.push(msg);
};

const prom = read('tooling/infra/prometheus.yaml');
const compose = read('docker-compose.yml');
const rules = read('tooling/infra/prometheus/alerts/edge-fail-closed.yaml');
const dashboard = JSON.parse(read('tooling/infra/grafana/dashboards/edge-slo.json'));

check(/rule_files:/.test(prom), 'prometheus.yaml must declare rule_files');
check(
  prom.includes('/etc/prometheus/alerts/*.yaml'),
  'prometheus.yaml rule_files must glob /etc/prometheus/alerts/*.yaml',
);

const promBlock = (() => {
  const lines = compose.split(/\r?\n/);
  const start = lines.findIndex((l) => l === '  prometheus:');
  check(start >= 0, 'docker-compose.yml must define prometheus');
  const out = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (i > start && /^\S/.test(line)) break;
    if (i > start && /^  [a-z]/.test(line) && !line.startsWith('  prometheus:')) break;
    out.push(line);
  }
  return out.join('\n');
})();

check(
  promBlock.includes('./tooling/infra/prometheus/alerts:/etc/prometheus/alerts'),
  'compose must mount tooling/infra/prometheus/alerts onto /etc/prometheus/alerts',
);

const ALERTS = ['IntafacedEdgeScrapeFailClosed', 'IntafacedEdgeHttpSeriesAbsent'];
for (const name of ALERTS) {
  check(rules.includes(`alert: ${name}`), `rules file must name alert ${name}`);
}
check(rules.includes('route: intafaced-edge-scrape'), 'scrape alert must set route label');
check(rules.includes('route: intafaced-edge-metrics'), 'series alert must set route label');
check(
  /up\{job="svc-edge"\}/.test(rules),
  'fail-closed scrape rule must match the existing svc-edge job',
);
check(
  rules.includes('absent(intafaced_http_requests_total)'),
  'series-absent rule must use the /metrics name the edge emits — not an invented series',
);
check(
  !/proven prod|production SLO met/i.test(rules),
  'rules must not claim proven prod SLOs',
);

const slo = (dashboard.panels ?? []).find((p) => p.id === 1);
check(slo, 'edge-slo.json must keep panel id 1 (availability SLO)');
const sloExpr = (slo?.targets ?? []).map((t) => t.expr ?? '').join('\n');
check(sloExpr.includes('intafaced_http_requests_total'), 'SLO panel must query the real counter');
check(!sloExpr.includes('clamp_min'), 'SLO panel must not fabricate a denominator with clamp_min');
check(!/\bup\b/.test(sloExpr), 'dashboard must not query up — svc-edge wiring test only allows emitted names');

const calcs = slo?.options?.reduceOptions?.calcs ?? [];
check(calcs.includes('last'), 'SLO stat must use last so a dead scrape cannot freeze last-green');
check(!calcs.includes('lastNotNull'), 'SLO stat must not use lastNotNull (stale green after scrape death)');

check(slo?.fieldConfig?.defaults?.noValue, 'SLO panel must set noValue so empty scrape is labelled');
const mappingMatch = JSON.stringify(slo?.fieldConfig?.defaults?.mappings ?? []);
check(/null/.test(mappingMatch), 'SLO panel must map null → not a green number');
check(/empty/.test(mappingMatch) || /nan/i.test(mappingMatch), 'SLO panel must map empty/NaN away from a ratio');

const thresholds = slo?.fieldConfig?.defaults?.thresholds?.steps ?? [];
check(thresholds[0]?.color === 'red', 'SLO empty/low must start at red, not green');

if (problems.length > 0) {
  console.error('observability-alerts: FAIL');
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}

console.log(
  `observability-alerts: ok — ${ALERTS.join(', ')}; dashboard empty scrape is not green`,
);
