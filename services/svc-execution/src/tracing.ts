import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';

/**
 * Tracing (§14 DoD).
 *
 * `intafaced.money_path=false` — this service holds no balances and posts no
 * ledger transactions. House fills would use `@intafaced/ledger-client` later.
 */
const tracer = trace.getTracer('svc-execution');

export async function withExecutionSpan<T>(name: string, tenantId: string, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', false);
    span.setAttribute('intafaced.module', 'execution');
    span.setAttribute('intafaced.execution.tenant_id', tenantId);

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof Error) span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}
