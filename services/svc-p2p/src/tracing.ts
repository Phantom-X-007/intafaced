import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD 5).
 *
 * Every escrow operation is tagged `intafaced.money_path=true`, which the
 * collector's tail sampler keys on to keep these traces at 100% regardless of
 * sampling elsewhere (tooling/infra/otel-collector.yaml).
 *
 * It matters more here than almost anywhere: the question an operator asks
 * about a P2P incident is never "was it slow", it is **"where did this specific
 * escrow go, and who decided"**. That question is only answerable if the trace
 * for the trade survived sampling, which is what the flag guarantees, and if
 * the trade id is on the span, which is what `tradeId` below guarantees.
 *
 * Amounts go on spans as decimal STRINGS. A bigint cannot be a span attribute
 * and a float would misreport the very numbers we are tracing to verify.
 */
const tracer = trace.getTracer('svc-p2p');

export interface MoneySpanAttributes {
  operation: string;
  /** Always set on an escrow span — it is the key an incident is searched by. */
  tradeId?: string;
  offerId?: string;
  /** Decimal string, never a number. Applies to fiat amounts too. */
  amount?: string;
  fiatAmount?: string;
  asset?: string;
  fiatCurrency?: string;
  sellerId?: string;
  buyerId?: string;
  moderatorId?: string;
  resolution?: string;
}

export async function withMoneySpan<T>(name: string, attributes: MoneySpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', true);
    span.setAttribute('intafaced.module', 'p2p');
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
        // The code is what an SLO dashboard groups by: `p2p.amount_above_max`
        // is a user hitting a rule, `p2p.escrow_missing` is an operator alarm.
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
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
