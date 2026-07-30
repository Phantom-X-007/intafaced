import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

/**
 * Tracing (§9, §14 DoD).
 *
 * svc-academy moves no value, so nothing here is tagged
 * `intafaced.money_path` — that flag exists so the collector's tail sampler
 * keeps money traces at 100%, and marking a non-money service with it would
 * dilute exactly the signal it protects.
 *
 * What this service traces instead is the thing a lobby fails at in a way
 * NOBODY REPORTS: a seat refused.
 *
 * Somebody who cannot get into a room does not file a ticket, they leave. So
 * `intafaced.decision` on the seat span is the only place "how many people
 * bounced off the stake gate tonight" is a number rather than a guess — and it
 * is the difference between a room whose tier is set too high and a room that
 * is simply popular, which look identical from every other angle.
 *
 * The session span carries `streamProvider` for the same reason: when it reads
 * `null`, every lobby in the fleet is running without audio or video, and that
 * is a fact an operator should be able to see without anyone complaining first.
 *
 * No user content ever reaches a span: no chat, no scene contents, no room
 * names. `AcademySpanAttributes` is a closed type for that reason.
 */
const tracer = trace.getTracer('svc-academy');

export type AcademyStage = 'lobby' | 'session';

export interface AcademySpanAttributes {
  stage: AcademyStage;
  operation: string;
  /** Ids are references, not content. */
  userId?: string;
  roomId?: string;
  sessionId?: string;
  /** `allowed`, or the refusal code — what a lobby dashboard groups by. */
  decision?: string;
  occupancy?: number;
  capacity?: number;
  streamProvider?: string;
}

export async function withAcademySpan<T>(name: string, attributes: AcademySpanAttributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute('intafaced.module', 'academy');
    span.setAttribute('intafaced.stage', attributes.stage);

    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'stage' || value === undefined) continue;
      span.setAttribute(`intafaced.${key}`, value as string | number);
    }

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : 'failed' });
      if (err instanceof Error) {
        span.recordException(err);
        // `academy.stream_unavailable` is a configuration alarm; `academy.room_full`
        // is a popular room. A dashboard has to be able to tell them apart.
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
