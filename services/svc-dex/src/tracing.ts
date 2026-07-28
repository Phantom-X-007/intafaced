import { SpanStatusCode, trace } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * `intafaced.money_path=false`, and unlike most services that is not a
 * judgement call — it is a structural fact. svc-dex never moves value; it
 * quotes and routes. Value moves in the user's own smart account, on chain,
 * under their key.
 *
 * The attribute worth carrying here is the routing decision itself: which
 * venues were considered and which won. When a user asks why their order filled
 * where it did, that trace is the answer.
 */
const tracer = trace.getTracer('svc-dex');

export async function withRouteSpan<T>(name: string, attributes: { side: string; venues: number }, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', false);
    span.setAttribute('intafaced.plane', 'protocol');
    span.setAttribute('intafaced.side', attributes.side);
    span.setAttribute('intafaced.venues_considered', attributes.venues);

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
