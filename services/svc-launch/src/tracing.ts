import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * Every write path in this service is a value movement, so each is tagged
 * `intafaced.money_path=true` — the attribute the collector's tail sampler keys
 * on to retain these traces at 100% regardless of sampling elsewhere
 * (tooling/infra/otel-collector.yaml).
 *
 * It matters more here than in a request/response service, because the two
 * paths that move the most value are not driven by a click. Settlement walks a
 * whole raise contributor by contributor, and a vesting claim can be issued by
 * a job. When settlement stalls on contributor 400 of 900, the span is the only
 * record of where it stopped — which is why a resumed settlement emits one per
 * contributor rather than one for the batch.
 *
 * Amounts go on spans as decimal STRINGS. A bigint cannot be a span attribute
 * and a float would misreport the very numbers we are tracing to verify.
 */
const tracer = trace.getTracer('svc-launch');

export interface MoneySpanAttributes {
  operation: string;
  /** Decimal string, never a number. */
  amount?: string;
  userId?: string;
  issuerId?: string;
  raiseId?: string;
  scheduleId?: string;
  assetId?: string;
  /** Which top-up or release this is — with the id, it names the money path exactly. */
  sequence?: number;
  contributors?: number;
  outcome?: string;
}

export async function withMoneySpan<T>(name: string, attributes: MoneySpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', true);
    span.setAttribute('intafaced.module', 'launch');
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
        // What a dashboard groups by: `ledger.insufficient_funds` is a
        // contributor without the funds they committed; `launch.stake_unavailable`
        // is svc-token being down, which stops every gated raise at once.
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
