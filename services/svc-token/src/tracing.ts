import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * Everything svc-token does moves value — staking, yield, emissions, burns — so
 * every operation here is tagged `intafaced.money_path=true`, which the
 * collector's tail sampler keys on to keep these traces at 100% regardless of
 * sampling elsewhere (tooling/infra/otel-collector.yaml).
 *
 * Amounts go on spans as decimal STRINGS. A bigint cannot be a span attribute
 * and a float would misreport the very numbers we are tracing to verify.
 */
const tracer = trace.getTracer('svc-token');

export interface MoneySpanAttributes {
  operation: string;
  /** Decimal string, never a number. */
  amount?: string;
  userId?: string;
  tier?: string;
  windowId?: string;
  epoch?: number;
}

export async function withMoneySpan<T>(name: string, attributes: MoneySpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', true);
    span.setAttribute('intafaced.module', 'token');
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
        // The code is what an SLO dashboard groups by: `token.stake_locked` is
        // a user hitting a rule, `token.supply_exhausted` is an operator alarm.
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
