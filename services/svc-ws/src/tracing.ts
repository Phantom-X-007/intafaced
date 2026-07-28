import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * `intafaced.money_path` is set explicitly to `false`, exactly as svc-matching
 * does, so a trace reader can tell "not a money path" from "someone forgot".
 * Nothing here can reach the ledger: the process holds no ledger client and no
 * service secret, and the custody boundary is a property of what it is allowed
 * to hold rather than of what it happens to call.
 *
 * A SPAN PER FRAME WOULD BE A DENIAL OF SERVICE ON THE COLLECTOR. At the
 * default cadence a hundred subscribed markets is four hundred deltas a second
 * before a single client connects. Spans are therefore per CONNECTION and per
 * upstream fetch — the things that fail — and the per-frame numbers live in
 * `/ready` as counters instead.
 */
const tracer = trace.getTracer('svc-ws');

export interface WsSpanAttributes {
  marketId?: string;
  /** Connections open at the moment the span started. */
  connections?: number;
}

export async function withWsSpan<T>(name: string, attributes: WsSpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', false);
    span.setAttribute('intafaced.module', 'ws');
    if (attributes.marketId) span.setAttribute('intafaced.market_id', attributes.marketId);
    if (typeof attributes.connections === 'number') span.setAttribute('intafaced.ws_connections', attributes.connections);

    try {
      const result = await fn(span);
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
