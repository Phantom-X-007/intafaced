import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * Every ledger post is traced and tagged `intafaced.money_path=true`, which the
 * collector's tail sampler keys on to keep money paths at 100% regardless of
 * sampling elsewhere (tooling/infra/otel-collector.yaml).
 */
const tracer = trace.getTracer('svc-ledger');

export interface MoneySpanAttributes {
  module: string;
  reason: string;
  idempotencyKey: string;
  entryCount: number;
}

export async function withMoneySpan<T>(name: string, attributes: MoneySpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', true);
    span.setAttribute('intafaced.module', attributes.module);
    span.setAttribute('intafaced.reason', attributes.reason);
    // The idempotency key is the thread that ties a retry storm together in a
    // trace view — without it, five retries look like five different problems.
    span.setAttribute('intafaced.idempotency_key', attributes.idempotencyKey);
    span.setAttribute('intafaced.entry_count', attributes.entryCount);

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      if (err instanceof Error) {
        span.recordException(err);
        // The error code is what an SLO dashboard groups by: an insufficient
        // funds rejection is normal, a serialization failure is not.
        span.setAttribute('intafaced.error_code', (err as { code?: string }).code ?? err.name);
      }
      throw err;
    } finally {
      span.end();
    }
  });
}

export async function withSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      return await fn();
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}
