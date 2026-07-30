import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * `intafaced.money_path=false` is set explicitly rather than left unset, so a
 * reader of the trace can tell "not a money path" from "someone forgot". This
 * service holds no balances and posts no ledger transactions — inbox rows only.
 * Push / email / SMS remain §13 sockets; spans here cover the in-app path only.
 */
const tracer = trace.getTracer('svc-notify');

export interface NotifySpanAttributes {
  /** Operation name for dashboards — e.g. create, list, markRead. */
  op: string;
  /** Notification kind when known (trade.fill, p2p.escrow.locked, …). */
  kind?: string;
  /** Bus subject that drove the insert, when fan-out is the caller. */
  sourceSubject?: string;
}

export async function withNotifySpan<T>(name: string, attributes: NotifySpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', false);
    span.setAttribute('intafaced.module', 'notify');
    span.setAttribute('intafaced.notify.op', attributes.op);
    if (attributes.kind) span.setAttribute('intafaced.notify.kind', attributes.kind);
    if (attributes.sourceSubject) span.setAttribute('intafaced.notify.source_subject', attributes.sourceSubject);

    try {
      const result = await fn(span);
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
