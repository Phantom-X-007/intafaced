import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * Note what is deliberately absent: `intafaced.money_path`. §5.1 draws this
 * service outside the money path — it holds no balances and posts no ledger
 * transactions, so tagging its spans as a money path would poison the
 * collector's tail sampler with traffic the treasury does not care about.
 * `intafaced.money_path=false` is set explicitly rather than left unset, so a
 * reader of the trace can tell "not a money path" from "someone forgot".
 *
 * The attributes that matter here are the ones that let an operator answer
 * "which order, in which book, at which sequence" from a trace alone —
 * sequence being the number that ties a span to a journal record (§5.1).
 */
const tracer = trace.getTracer('svc-matching');

export interface EngineSpanAttributes {
  marketId: string;
  orderId?: string;
  side?: string;
  orderType?: string;
  tif?: string;
}

export interface EngineSpanResult {
  sequence?: number | null;
  fillCount?: number;
  accepted?: boolean;
  rejectCode?: string;
}

export async function withEngineSpan<T extends EngineSpanResult>(
  name: string,
  attributes: EngineSpanAttributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', false);
    span.setAttribute('intafaced.module', 'matching');
    span.setAttribute('intafaced.market_id', attributes.marketId);
    if (attributes.orderId) span.setAttribute('intafaced.order_id', attributes.orderId);
    if (attributes.side) span.setAttribute('intafaced.order_side', attributes.side);
    if (attributes.orderType) span.setAttribute('intafaced.order_type', attributes.orderType);
    if (attributes.tif) span.setAttribute('intafaced.time_in_force', attributes.tif);

    try {
      const result = await fn(span);

      if (typeof result.sequence === 'number') span.setAttribute('intafaced.sequence', result.sequence);
      if (typeof result.fillCount === 'number') span.setAttribute('intafaced.fill_count', result.fillCount);
      if (typeof result.accepted === 'boolean') span.setAttribute('intafaced.accepted', result.accepted);
      // A rejection is a normal outcome, not an error — post-only refusing to
      // cross is the feature working. It is an attribute so dashboards can
      // group by it without every rejected order lighting up as a failure.
      if (result.rejectCode) span.setAttribute('intafaced.reject_code', result.rejectCode);

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
