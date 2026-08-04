import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';

/**
 * Tracing (§14 DoD).
 *
 * `intafaced.money_path=false` is explicit — this service holds no balances and
 * posts no ledger transactions. Spans cover ticket/KB ops only.
 */
const tracer = trace.getTracer('svc-support');

export interface SupportSpanAttributes {
  op: string;
  ticketId?: string;
}

export async function withSupportSpan<T>(name: string, attributes: SupportSpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', false);
    span.setAttribute('intafaced.module', 'support');
    span.setAttribute('intafaced.support.op', attributes.op);
    if (attributes.ticketId) span.setAttribute('intafaced.support.ticket_id', attributes.ticketId);

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
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
