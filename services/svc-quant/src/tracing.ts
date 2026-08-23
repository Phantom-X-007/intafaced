import { SpanStatusCode, trace } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * `intafaced.money_path=false` — paper book only, no ledger post.
 */
const tracer = trace.getTracer('svc-quant');

export async function withQuantSpan<T>(name: string, attributes: { language: string }, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', false);
    span.setAttribute('intafaced.module', 'quant');
    span.setAttribute('intafaced.quant.language', attributes.language);

    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
