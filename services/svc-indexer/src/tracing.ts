import { trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * There is no `withMoneySpan` in this service, and the absence is deliberate:
 * `intafaced.money_path` marks spans that lead to a ledger post, and nothing
 * here ever does. What these spans carry instead is `intafaced.custodial=false`
 * on every one — so a trace search for custodial activity on the Protocol Plane
 * returns nothing, verifiably, rather than by assertion in a README.
 *
 * The attribute worth having on an indexer is `intafaced.reorg`: a projection
 * that repairs itself does so silently by design, and an operator needs to be
 * able to find those repairs afterwards without reading a log line that may not
 * have been written.
 */
const tracer = trace.getTracer('svc-indexer');

function baseAttributes(span: { setAttribute(key: string, value: string | number | boolean): unknown }): void {
  span.setAttribute('intafaced.module', 'indexer');
  span.setAttribute('intafaced.plane', 'protocol');
  span.setAttribute('intafaced.custodial', false);
}

export async function withSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    baseAttributes(span);
    try {
      const result = await fn();
      // Sync results carry the numbers an operator actually asks for.
      const stats = result as { blocksApplied?: number; reorgs?: number; blocksOrphaned?: number } | null;
      if (stats && typeof stats === 'object') {
        if (typeof stats.blocksApplied === 'number') span.setAttribute('intafaced.blocks_applied', stats.blocksApplied);
        if (typeof stats.reorgs === 'number') span.setAttribute('intafaced.reorgs', stats.reorgs);
        if (typeof stats.blocksOrphaned === 'number') span.setAttribute('intafaced.blocks_orphaned', stats.blocksOrphaned);
      }
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      if (err instanceof Error) {
        span.recordException(err);
        span.setAttribute('intafaced.error_code', (err as { code?: string }).code ?? err.name);
      }
      throw err;
    } finally {
      span.end();
    }
  });
}

/** A span over one read-model query. Carries the market so slow books are findable. */
export async function withReadSpan<T>(name: string, market: string | null, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    baseAttributes(span);
    if (market) span.setAttribute('intafaced.market', market);
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      if (err instanceof Error) span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}
