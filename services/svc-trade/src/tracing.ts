import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * Placing an order, settling a fill and cancelling an order all end in
 * `ledger.post()`, so every one of them is a money path and every one of them
 * is tagged `intafaced.money_path=true` — the attribute the collector's tail
 * sampler keys on to keep these traces at 100% regardless of sampling elsewhere
 * (tooling/infra/otel-collector.yaml).
 *
 * This is the opposite decision to svc-matching, which sets the same attribute
 * to `false`. That is the boundary made visible in the trace: the engine moves
 * no value, this service moves all of it, and one trace crossing both should
 * say so.
 *
 * Amounts go on spans as decimal STRINGS. A bigint cannot be a span attribute
 * and a float would misreport the very numbers we are tracing to verify.
 */
const tracer = trace.getTracer('svc-trade');

export interface MoneySpanAttributes {
  operation: string;
  userId?: string;
  orderId?: string;
  marketId?: string;
  symbol?: string;
  side?: string;
  /** Decimal string, never a number. */
  qty?: string;
  /** Decimal string, never a number. */
  amount?: string;
  assetId?: string;
}

export async function withMoneySpan<T>(name: string, attributes: MoneySpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', true);
    span.setAttribute('intafaced.module', 'trade');
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
        // The code is what an SLO dashboard groups by: `trade.market_halted` is
        // an operator action working, `ledger.insufficient_funds` is a user
        // hitting a limit, and `trade.hold_uncovered` is an alarm.
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
