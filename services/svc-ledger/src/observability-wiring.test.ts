import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMITTED_LABEL_NAMES } from '@intafaced/telemetry';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { METRICS_PATH, registerMetrics } from './metrics.js';

/**
 * DOES ANYTHING ACTUALLY SCRAPE IT?
 *
 * `metrics.test.ts` proves the endpoint is mounted and its output parses.
 * That is necessary and it is not sufficient. A scrape target pointing at
 * localhost, at a host port, or at a path the service does not serve looks
 * complete in a diff and reports nothing.
 *
 * This file reads THE REAL CONFIG FILES from the repo and cross-checks them
 * against THE REAL ROUTE. It never compares a config against a constant
 * retyped from that config.
 *
 * Ledger has no Grafana dashboard of its own — the SLO panel stays on the
 * edge. This file therefore does not parse dashboard JSON.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

function blockAt(text: string, indent: number, key: string): string {
  const pad = ' '.repeat(indent);
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `${pad}${key}:` || l.startsWith(`${pad}${key}: `));
  if (start < 0) throw new Error(`no block "${key}" at indent ${indent}`);

  const out = [lines[start] as string];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line.trim() !== '' && !line.startsWith(`${pad} `) && !line.startsWith(`${pad}\t`)) break;
    out.push(line);
  }
  return out.join('\n');
}

function scrapeJob(prometheusYaml: string, jobName: string): string {
  const lines = prometheusYaml.split(/\r?\n/);
  const starts = lines.reduce<number[]>((acc, l, i) => (l.trim() === `- job_name: ${jobName}` ? [...acc, i] : acc), []);

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

describe('the scrape config reaches the endpoint this service actually serves', () => {
  const job = () => scrapeJob(read('tooling/infra/prometheus.yaml'), 'svc-ledger');

  it('targets the compose service name, not localhost and not a host port', () => {
    const targets = /targets:\s*\[([^\]]*)\]/.exec(job());
    expect(targets).not.toBeNull();

    const hosts = (targets?.[1] ?? '').split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, ''));
    expect(hosts).toEqual(['svc-ledger:4001']);

    expect(hosts.join()).not.toContain('localhost');
    expect(hosts.join()).not.toContain('127.0.0.1');
  });

  it('names the port svc-ledger is actually configured to listen on', () => {
    const composeLedger = blockAt(read('docker-compose.apps.yml'), 2, 'svc-ledger');
    const httpPort = /HTTP_PORT:\s*'?(\d+)'?/.exec(composeLedger)?.[1];

    expect(httpPort).toBeDefined();

    const target = /targets:\s*\[\s*['"]([^'"]+)['"]/.exec(job())?.[1];
    const [host, port] = (target ?? '').split(':');

    expect(port).toBe(httpPort);
    expect(host).toBe('svc-ledger');
    expect(read('docker-compose.apps.yml')).toContain(`\n  ${host}:\n`);
  });

  it('scrapes the path the service registers, character for character', () => {
    const metricsPath = /metrics_path:\s*(\S+)/.exec(job())?.[1];
    expect(metricsPath).toBe(METRICS_PATH);
  });

  it('sits on the same compose network as prometheus', () => {
    expect(read('docker-compose.apps.yml')).toMatch(/include:\s*\n\s*-\s*docker-compose\.yml/);
    expect(read('docker-compose.yml')).toContain('prom/prometheus');
  });

  it('adds no label the exposition already owns', () => {
    const block = job();
    for (const name of EMITTED_LABEL_NAMES) {
      expect(block).not.toMatch(new RegExp(`^\\s+${name}:`, 'm'));
    }
  });
});

describe('a live inject of the real route emits what the scrape job would collect', () => {
  it('GET /metrics contains the duration family before any other traffic', async () => {
    const app = Fastify({ logger: false });
    registerMetrics(app, { service: 'svc-ledger' });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: METRICS_PATH });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('intafaced_http_request_duration_seconds');
  });
});
