import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * svc-bank's read paths are projections and its write paths are all value
 * movements, so every write here is tagged `intafaced.money_path=true` — the
 * attribute the collector's tail sampler keys on to retain these traces at 100%
 * regardless of sampling elsewhere (tooling/infra/otel-collector.yaml).
 *
 * It matters more here than almost anywhere: the two most consequential paths
 * in this service are driven by a SCHEDULER, not by a user request. When a
 * standing order does not fire, there is no angry click to correlate against —
 * the trace is the only record that the job considered the occurrence at all.
 * That is why a skipped occurrence gets a span too, not just a settled one.
 *
 * Amounts go on spans as decimal STRINGS. A bigint cannot be a span attribute
 * and a float would misreport the very numbers we are tracing to verify.
 */
const tracer = trace.getTracer('svc-bank');

export interface MoneySpanAttributes {
  operation: string;
  /** Decimal string, never a number. */
  amount?: string;
  userId?: string;
  assetId?: string;
  spaceId?: string;
  scheduleId?: string;
  /** The deterministic firing index — with scheduleId, this identifies the money path exactly. */
  occurrence?: number;
  poolId?: string;
  positionId?: string;
  /** Accrual day, YYYY-MM-DD. */
  date?: string;
  /** §8.1 loans. */
  loanId?: string;
  /** Which rung of a liquidation ladder — with loanId, this identifies the seizure exactly. */
  tranche?: number;
  /** §8.1 cards. Never a card number — there is none, and this service stores none. */
  cardId?: string;
  /** The issuer's reference for one authorisation. */
  authorizationRef?: string;
}

export async function withMoneySpan<T>(name: string, attributes: MoneySpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', true);
    span.setAttribute('intafaced.module', 'bank');
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
        // The code is what an SLO dashboard groups by: `ledger.insufficient_funds`
        // on a standing order is a user with an empty space; `bank.pool_underfunded`
        // is an operator alarm about yield we cannot pay.
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
