import { SpanStatusCode, trace } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * `intafaced.money_path=false`, and that is a deliberate statement rather than
 * an omission. The edge moves no value — it shapes a request and forwards it.
 * The same trace continues into a service that does move value and is tagged
 * `true` there, so a single trace crossing the boundary shows exactly where
 * authority became money. Tagging the edge `true` would flood the tail sampler
 * with every health check and static asset.
 *
 * What IS worth recording here is the authorisation outcome: whether a request
 * arrived authenticated, anonymous, or with a token we refused. That is the
 * signal an operator needs when the answer to "why is nothing working" is
 * "every request is anonymous because two secrets disagree".
 */
const tracer = trace.getTracer('svc-edge');

export interface EdgeSpanAttributes {
  /** Route prefix, not the full path — a user id in a span name is a leak. */
  upstream: string;
  method: string;
  /** 'authenticated' | 'anonymous' | a rejection reason. */
  auth: string;
}

export async function withEdgeSpan<T>(name: string, attributes: EdgeSpanAttributes, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', false);
    span.setAttribute('intafaced.upstream', attributes.upstream);
    span.setAttribute('http.request.method', attributes.method);
    span.setAttribute('intafaced.auth_outcome', attributes.auth);

    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      // An upstream failure is the edge's normal weather, not its own fault —
      // but it must still be visible, because a service that is down looks
      // identical to a service that is slow from outside.
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
