import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTelemetry, isTelemetryActive } from './start.js';

/**
 * These tests exist because the bug this package fixes was INVISIBLE: eighteen
 * services wrote spans for months into a no-op tracer and every one of them
 * looked healthy. A test that asserts `startTelemetry()` returned an object
 * would have passed the whole time.
 *
 * So the assertion here is the only one worth making — a real OTLP payload
 * arrives on a real socket, carrying the `intafaced.money_path` attribute the
 * collector's tail sampler keys on. If this test can pass while Tempo stays
 * empty, it is the wrong test.
 */

/** One captured OTLP/HTTP export request body. */
const received: Array<{ path: string; body: string }> = [];

let collector: Server;
let endpoint: string;

beforeAll(async () => {
  collector = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      received.push({ path: req.url ?? '', body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${(collector.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => collector.close(() => resolve()));
});

describe('startTelemetry', () => {
  it('registers nothing when OTEL_ENABLED is false, so spans stay no-op', () => {
    const handle = startTelemetry({ serviceName: 'svc-test', endpoint, enabled: false });
    expect(handle.enabled).toBe(false);
    expect(isTelemetryActive()).toBe(false);
  });

  it('delivers a money span to the collector over OTLP/HTTP', async () => {
    const handle = startTelemetry({
      serviceName: 'svc-ledger',
      endpoint,
      enabled: true,
      environment: 'test',
    });

    expect(handle.enabled).toBe(true);
    // The claim that matters: `trace.getTracer` no longer hands back a no-op.
    expect(isTelemetryActive()).toBe(true);

    const tracer = trace.getTracer('svc-ledger');
    await tracer.startActiveSpan('ledger.post', async (span) => {
      span.setAttribute('intafaced.money_path', true);
      span.setAttribute('intafaced.module', 'ledger');
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    });

    // A BatchSpanProcessor holds spans in memory; shutdown is what flushes
    // them. This is precisely why services must call it on SIGTERM.
    await handle.shutdown();

    expect(received.length).toBeGreaterThan(0);
    const exportRequest = received.find((r) => r.path.endsWith('/v1/traces'));
    expect(exportRequest, 'no export hit the collector').toBeDefined();

    const payload = exportRequest!.body;
    expect(payload).toContain('ledger.post');
    expect(payload).toContain('intafaced.money_path');
    expect(payload).toContain('svc-ledger');
  });

  it('shutdown is idempotent and never throws', async () => {
    const handle = startTelemetry({ serviceName: 'svc-test', endpoint, enabled: false });
    await expect(handle.shutdown()).resolves.toBeUndefined();
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });
});
