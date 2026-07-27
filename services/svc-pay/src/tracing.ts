import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD, AGENT_PROTOCOL §5).
 *
 * Every operation in this service either posts to the ledger or decides whether
 * a posting happens, so every one of them is tagged `intafaced.money_path=true`
 * — which the collector's tail sampler keys on to keep these traces at 100%
 * regardless of sampling elsewhere (tooling/infra/otel-collector.yaml).
 *
 * It matters more here than almost anywhere: a payment crosses a rail, the
 * ledger, and this service's own tables, and when one of those three disagrees
 * with the other two, the trace is the only artefact that has seen all three in
 * order.
 *
 * Amounts go on spans as decimal STRINGS. A bigint cannot be a span attribute
 * and a float would misreport the very numbers we are tracing to verify.
 */
const tracer = trace.getTracer('svc-pay');

export interface MoneySpanAttributes {
  operation: string;
  /** Decimal string, never a number. */
  amount?: string;
  paymentId?: string;
  merchantId?: string;
  /** The adapter id — which rail is on the other side of this span. */
  rail?: string;
  railRef?: string;
  assetId?: string;
  window?: string;
  settlementId?: string;
}

export async function withMoneySpan<T>(name: string, attributes: MoneySpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', true);
    span.setAttribute('intafaced.module', 'pay');
    span.setAttribute('intafaced.operation', attributes.operation);

    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'operation' || value === undefined) continue;
      span.setAttribute(`intafaced.${key}`, value);
    }

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      if (err instanceof Error) {
        span.recordException(err);
        // The code is what an SLO dashboard groups by: `pay.rail_declined` is a
        // buyer's issuer saying no, `pay.capture_exceeds_authorized` is a bug
        // in a merchant's integration, and `ledger.insufficient_funds` on a
        // refund is an operator alarm. Three very different pages.
        span.setAttribute('intafaced.error_code', (err as { code?: string }).code ?? err.name);
      }
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * A span around a call to an external rail.
 *
 * Separate from `withMoneySpan` because the failure modes are different in kind:
 * a rail span that never closes is a rail that stopped answering, and that is
 * the single most useful thing an on-call engineer can be shown at 3am.
 */
export async function withRailSpan<T>(rail: string, operation: string, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(`rail.${operation}`, async (span) => {
    span.setAttribute('intafaced.money_path', true);
    span.setAttribute('intafaced.module', 'pay');
    span.setAttribute('intafaced.rail', rail);
    span.setAttribute('intafaced.operation', operation);
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
