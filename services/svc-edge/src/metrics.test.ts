import { describe, expect, it } from 'vitest';
import { DURATION_BUCKETS, EdgeMetrics, statusClass } from './metrics.js';

const labels = { module: 'trade', procedure: 'orders.create', status: '2xx', auth: 'authenticated' } as const;

describe('status classes', () => {
  it('collapses codes to the class an SLO is written against', () => {
    expect(statusClass(200)).toBe('2xx');
    expect(statusClass(302)).toBe('3xx');
    expect(statusClass(403)).toBe('4xx');
    expect(statusClass(503)).toBe('5xx');
  });
});

describe('exposition', () => {
  it('renders a counter and a histogram Prometheus can parse', () => {
    const m = new EdgeMetrics();
    m.observe(labels, 0.02);
    m.observe(labels, 0.4);
    const text = m.render();

    expect(text).toContain('# TYPE intafaced_edge_requests_total counter');
    expect(text).toContain('# TYPE intafaced_edge_request_duration_seconds histogram');
    expect(text).toContain('intafaced_edge_requests_total{module="trade",procedure="orders.create",status="2xx",auth="authenticated"} 2');
    expect(text).toMatch(/intafaced_edge_request_duration_seconds_count\{[^}]*\} 2/);
    expect(text).toMatch(/intafaced_edge_request_duration_seconds_sum\{[^}]*\} 0\.42/);
    // Every line is either a comment or `name{labels} value`.
    for (const line of text.trim().split('\n')) {
      expect(line, line).toMatch(/^(#.*| *[a-zA-Z_][a-zA-Z0-9_]*(\{.*\})? -?[0-9.eE+]+)$/);
    }
  });

  it('accumulates buckets cumulatively, which is what histogram_quantile assumes', () => {
    const m = new EdgeMetrics();
    m.observe(labels, 0.02);
    const text = m.render();

    // 0.02s falls in every bucket from 0.025 upwards, and in none below it.
    expect(text).toContain('le="0.01"},'.replace('},', '}') + ' 0');
    expect(text).toContain('le="0.025"} 1');
    expect(text).toContain('le="+Inf"} 1');
    expect(DURATION_BUCKETS[0]).toBeLessThan(DURATION_BUCKETS[DURATION_BUCKETS.length - 1] as number);
  });

  /**
   * The label comes off a caller-controlled URL, so this is not hygiene — it is
   * the difference between a metrics store and a denial-of-service target.
   */
  it('collapses new label sets into one series once the cap is reached', () => {
    const m = new EdgeMetrics(2);
    m.observe({ ...labels, procedure: 'a' }, 0.01);
    m.observe({ ...labels, procedure: 'b' }, 0.01);
    for (let i = 0; i < 50; i += 1) m.observe({ ...labels, procedure: `junk${i}` }, 0.01);

    const text = m.render();
    const seriesLines = text.split('\n').filter((l) => l.startsWith('intafaced_edge_requests_total{'));
    expect(seriesLines).toHaveLength(3); // a, b, _overflow
    expect(text).toContain('procedure="_overflow"');
  });

  it('escapes a label value rather than emitting a line Prometheus rejects', () => {
    const m = new EdgeMetrics();
    m.observe({ ...labels, module: 'we"ird' }, 0.01);
    expect(m.render()).toContain('module="we\\"ird"');
  });
});
