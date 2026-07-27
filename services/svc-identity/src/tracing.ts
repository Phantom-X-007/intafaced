import { trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * Auth spans deliberately record the OUTCOME but never the credential — no
 * password, no TOTP code, no token, not even hashed. A trace backend is not a
 * secrets store, and an attribute added "just for debugging" is how credentials
 * end up in one.
 */
const tracer = trace.getTracer('svc-identity');

export async function withAuthSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    for (const [key, value] of Object.entries(attributes)) span.setAttribute(key, value);

    try {
      const result = await fn();
      span.setAttribute('intafaced.auth.outcome', 'success');
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      // The error CODE is safe and is what an SLO dashboard groups by; the
      // message might carry an identifier, so it does not go on the span.
      span.setAttribute('intafaced.auth.outcome', 'failure');
      span.setAttribute('intafaced.error_code', (err as { code?: string })?.code ?? 'unknown');
      span.setStatus({ code: SpanStatusCode.ERROR });
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
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
