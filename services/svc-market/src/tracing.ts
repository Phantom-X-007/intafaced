import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';

/**
 * Tracing (§14 DoD).
 *
 * `intafaced.money_path=false` is explicit and it is not a placeholder — this
 * service holds no balances, posts no ledger transactions and imports no ledger
 * client. Spans cover the vendor lifecycle only: an application being made, and
 * an operator deciding on one.
 */
const tracer = trace.getTracer('svc-market');

export interface MarketSpanAttributes {
  op: string;
  vendorId?: string;
}

export async function withMarketSpan<T>(name: string, attributes: MarketSpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', false);
    span.setAttribute('intafaced.module', 'market');
    span.setAttribute('intafaced.market.op', attributes.op);
    if (attributes.vendorId) span.setAttribute('intafaced.market.vendor_id', attributes.vendorId);

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
