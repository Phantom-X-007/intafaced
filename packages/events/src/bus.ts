import type { EventDef, EventName, EventCatalog } from './catalog.js';
import { EVENT_CATALOG } from './catalog.js';
import { createEnvelope, type Envelope } from './envelope.js';
import type { z } from 'zod';

/**
 * The bus interface every service codes against. Implementations: JetStream
 * (prod/dev) and in-memory (tests). No service imports `nats` directly.
 */

export type Payload<K extends EventName> = z.infer<EventCatalog[K]['schema']>;

export interface PublishOptions {
  /**
   * Dedupe key. Defaults to the envelope id, which makes the publish
   * at-least-once but not idempotent — pass a business key (order id, tx id)
   * whenever one exists.
   */
  idempotencyKey?: string;
  traceparent?: string;
  causationId?: string;
  correlationId?: string;
  occurredAt?: Date;
}

export interface Handler<K extends EventName> {
  (payload: Payload<K>, envelope: Envelope<Payload<K>>): Promise<void> | void;
}

export interface SubscribeOptions {
  /** Durable consumer name. Required for JetStream — this is what survives restarts. */
  durable: string;
  /** Max redeliveries before the message goes to the dead-letter subject. */
  maxDeliver?: number;
  signal?: AbortSignal;
}

export interface Subscription {
  unsubscribe(): Promise<void>;
}

export interface EventBus {
  publish<K extends EventName>(name: K, payload: Payload<K>, opts?: PublishOptions): Promise<Envelope<Payload<K>>>;
  subscribe<K extends EventName>(name: K, handler: Handler<K>, opts: SubscribeOptions): Promise<Subscription>;
  close(): Promise<void>;
}

export class EventValidationError extends Error {
  constructor(
    readonly subject: string,
    readonly issues: readonly string[],
  ) {
    super(`Payload rejected for "${subject}":\n  - ${issues.join('\n  - ')}`);
    this.name = 'EventValidationError';
  }
}

/**
 * Validate a payload against its catalog schema. Called on BOTH publish and
 * consume: a producer cannot emit garbage, and a consumer cannot be poisoned by
 * a producer running an older build.
 */
export function validatePayload<K extends EventName>(name: K, payload: unknown): Payload<K> {
  const def = EVENT_CATALOG[name] as EventDef;
  const result = def.schema.safeParse(payload);
  if (!result.success) {
    throw new EventValidationError(
      def.subject,
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data as Payload<K>;
}

export function buildEnvelope<K extends EventName>(
  name: K,
  payload: Payload<K>,
  producer: string,
  opts: PublishOptions = {},
): Envelope<Payload<K>> {
  const def = EVENT_CATALOG[name] as EventDef;
  const validated = validatePayload(name, payload);
  const env = createEnvelope<Payload<K>>({
    subject: def.subject,
    version: def.version,
    producer,
    idempotencyKey: opts.idempotencyKey ?? crypto.randomUUID(),
    payload: validated,
    ...(opts.occurredAt ? { occurredAt: opts.occurredAt } : {}),
    ...(opts.traceparent ? { traceparent: opts.traceparent } : {}),
    ...(opts.causationId ? { causationId: opts.causationId } : {}),
    ...(opts.correlationId ? { correlationId: opts.correlationId } : {}),
  });
  return env;
}

/**
 * Idempotency guard — §10: "consumers idempotent".
 *
 * Wrap a handler so a redelivered envelope is a no-op. The default store is
 * in-memory (fine for tests and single-instance dev); services pass a Redis or
 * Postgres-backed store in prod so dedupe survives a restart and spans replicas.
 */
export interface SeenStore {
  /** Returns true if this key was already processed; marks it otherwise. */
  checkAndSet(key: string): Promise<boolean>;
}

export class MemorySeenStore implements SeenStore {
  private readonly seen = new Set<string>();
  constructor(private readonly max = 100_000) {}

  async checkAndSet(key: string): Promise<boolean> {
    if (this.seen.has(key)) return true;
    if (this.seen.size >= this.max) {
      // Bounded: drop the oldest insertion (Set preserves insertion order).
      const oldest = this.seen.values().next();
      if (!oldest.done) this.seen.delete(oldest.value);
    }
    this.seen.add(key);
    return false;
  }
}

export function idempotent<K extends EventName>(handler: Handler<K>, store: SeenStore, scope: string): Handler<K> {
  return async (payload, envelope) => {
    const key = `${scope}:${envelope.subject}:${envelope.idempotencyKey}`;
    if (await store.checkAndSet(key)) return;
    await handler(payload, envelope);
  };
}
