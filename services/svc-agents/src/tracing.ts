import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * Two span shapes, because svc-agents does two different jobs and they have
 * different observability requirements.
 *
 *   `withEngineSpan` — a call to a model provider. High volume, latency- and
 *   failure-oriented. Sampled normally.
 *
 *   `withMoneySpan`  — usage settlement. Tagged `intafaced.money_path=true`,
 *   which the collector's tail sampler keys on to keep these traces at 100%
 *   regardless of sampling elsewhere (tooling/infra/otel-collector.yaml).
 *
 * ── What must never reach a span ────────────────────────────────────────────
 *
 * §9: "secrets via vault". The upstream API key is set on exactly one object in
 * this service — the outgoing request's headers — and nothing else, including
 * this file, ever sees it.
 *
 * Prompts and completions do not go on spans either. They are user content, and
 * §10 keeps user content out of general stores; a trace backend is a general
 * store with a long retention and a broad access list. What goes on the span is
 * the DIGEST, which is enough to correlate a trace with an `agent_actions` row
 * and prove they describe the same call, and not enough to read the call.
 *
 * Amounts go on spans as decimal STRINGS. A bigint cannot be a span attribute
 * and a float would misreport the very numbers we are tracing to verify.
 */
const tracer = trace.getTracer('svc-agents');

export interface EngineSpanAttributes {
  operation: string;
  /** Routing task id, never a model product name. */
  task?: string;
  /** Logical provider id from configuration. */
  providerId?: string;
  /** The routing alias. The concrete upstream id stays inside the adapter. */
  model?: string;
  sessionId?: string;
  agentId?: string;
  userId?: string;
  /** SHA-256 of the canonical request. Correlates with the audit row. */
  inputDigest?: string;
}

export async function withEngineSpan<T>(name: string, attributes: EngineSpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.module', 'agents');
    span.setAttribute('intafaced.operation', attributes.operation);
    applyAttributes(span, attributes);

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      if (err instanceof Error) {
        span.recordException(err);
        // The code is what an SLO dashboard groups by: `agents.refused` is the
        // guardrail working, `agents.provider_failed` is an operator alarm.
        span.setAttribute('intafaced.error_code', (err as { code?: string }).code ?? err.name);
      }
      throw err;
    } finally {
      span.end();
    }
  });
}

export interface MoneySpanAttributes {
  operation: string;
  /** Decimal string, never a number. */
  amount?: string;
  assetId?: string;
  userId?: string;
  sessionId?: string;
  windowId?: string;
  /** The business idempotency key handed to the ledger. */
  chargeKey?: string;
}

export async function withMoneySpan<T>(name: string, attributes: MoneySpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.money_path', true);
    span.setAttribute('intafaced.module', 'agents');
    span.setAttribute('intafaced.operation', attributes.operation);
    applyAttributes(span, attributes);

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

function applyAttributes(span: Span, attributes: object): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'operation' || value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      span.setAttribute(`intafaced.${key}`, value);
    }
  }
}

/** Token counts belong on the span; the text they were produced from does not. */
export function recordUsage(span: Span, usage: { inputTokens: number; outputTokens: number }): void {
  span.setAttribute('intafaced.input_tokens', usage.inputTokens);
  span.setAttribute('intafaced.output_tokens', usage.outputTokens);
}
